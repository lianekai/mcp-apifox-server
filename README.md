# Apifox MCP Server

## 项目简介
`mcp-apifox-server` 参考 `mcp-dm8-server` / `mcp-opengauss-server` 和 `dm-mcp-server` 的架构，封装 Apifox 官方 OpenAPI + `apifox-cli`，让支持 MCP 的客户端（Claude Desktop、Cursor、Cline、mcp-router 等）可以：

- 直接导出/导入 Apifox 项目中的接口文档
- 扫描本地项目 Controller/Router 自动生成 OpenAPI 并同步到 Apifox
- 一键调用 `apifox-cli run` 执行测试场景，回传报告日志

## 功能概览
- **接口管理**：`apifox_export_openapi`、`apifox_import_openapi` 双向同步，支持智能合并 / 覆盖策略
- **文档查询**：`apifox_search_openapi` 基于导出的 OpenAPI 文档按关键字检索接口，`apifox_get_operation_detail` 按 path + method 精确获取单个接口详情，`apifox_get_operation_by_id` 按 operationId 精确获取接口详情
- **代码扫描**：`apifox_generate_openapi`、`apifox_sync_controllers` 解析 NestJS/Express 控制器自动生成 OAS 3.1
- **测试联动**：`apifox_run_cli_test` 自动拼装 Access Token/Project ID 触发 `apifox-cli`
- **安全提示**：缺失 Access Token 或权限不足时会在启动阶段告警，避免误写入

## 环境要求
- Node.js >= 18（需要原生 `fetch`）
- npm >= 9
- Apifox Access Token（项目管理员）与 Project ID
- 已安装 `apifox-cli`（全局或绝对路径）

## 安装
```bash
cd mcp-apifox-server
npm install
npm run build
```
构建完成后可执行（本地源码运行）：
```bash
node dist/index.js             # 以 MCP 服务方式运行
node dist/cli.js --version     # 查看版本
```

发布到 npm 后，推荐通过 `npx` 方式给各类 AI 工具调用：

```bash
# 直接启动 MCP 服务器（无需全局安装）
npx -y mcp-apifox-server
# 或使用别名命令
npx -y mcp-apifox
```

## 配置方式
支持 **环境变量**、**CLI 参数**、**运行时 setConfig**，优先级：运行时 > CLI > 环境变量。

| 配置项 | CLI 参数 | 环境变量 | 说明 |
| --- | --- | --- | --- |
| Access Token | `--accessToken` | `APIFOX_ACCESS_TOKEN` | 必填，用于官方 API / CLI |
| Project ID | `--projectId` | `APIFOX_PROJECT_ID` | 必填，指定 Apifox 项目 |
| API 版本头 | `--apiVersion` | `APIFOX_API_VERSION` | 默认 `2024-03-28` |
| API Base | `--apiBaseUrl` | `APIFOX_API_BASE_URL` | 默认 `https://api.apifox.com/v1` |
| Locale | `--locale` | `APIFOX_LOCALE` | 默认 `zh-CN` |
| CLI 可执行文件 | `--cliExecutable` | `APIFOX_CLI` | 默认 `apifox` |

`.env` 示例：
```env
APIFOX_ACCESS_TOKEN=APS-xxxxxxxxxxxxxxxx
APIFOX_PROJECT_ID=123456
APIFOX_LOCALE=zh-CN
APIFOX_CLI=/usr/local/bin/apifox
```

## MCP 客户端配置示例

### 通用 JSON 配置（Codex CLI / Claude Code / Thinking / Exa / Context7 等）

大多数支持 MCP 的客户端（如 Codex CLI、Claude Code、Thinking、Exa、Context7 等）都遵循统一的 `mcpServers` 配置格式，可以直接使用 `npx` 启动本服务：

```jsonc
{
  "mcpServers": {
    "apifox": {
      "command": "npx",
      "args": ["-y", "mcp-apifox-server"],
      "env": {
        "APIFOX_ACCESS_TOKEN": "APS-xxxxxxxx",
        "APIFOX_PROJECT_ID": "123456",
        "APIFOX_LOCALE": "zh-CN"
      }
    }
  }
}
```

如果你更偏向于使用本地构建好的文件，也可以改成：

```jsonc
{
  "mcpServers": {
    "apifox": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-apifox-server/dist/index.js"],
      "env": {
        "APIFOX_ACCESS_TOKEN": "APS-xxxxxxxx",
        "APIFOX_PROJECT_ID": "123456"
      }
    }
  }
}
```

> 提示：  
> - Codex CLI：通常在 `mcpServers` 配置文件中直接加入上面的 `apifox` 节点即可。  
> - Thinking / Exa / Context7：如果提供 MCP 配置 UI，一般也是要求填写 `command` / `args` / `env`，可以照抄上述 JSON。  

### Cursor 集成示例

在 Cursor 中，打开 **Settings → MCP → Add new MCP**，添加类似配置：

```jsonc
{
  "mcpServers": {
    "Apifox MCP": {
      "command": "npx",
      "args": ["-y", "mcp-apifox-server"],
      "env": {
        "APIFOX_ACCESS_TOKEN": "APS-xxxxxxxx",
        "APIFOX_PROJECT_ID": "123456"
      }
    }
  }
}
```

保存后，Cursor 会通过 `npx -y mcp-apifox-server` 启动 MCP 服务，并在侧边栏工具列表中展示 `apifox_*` 系列工具。

## 工具列表
| 工具名 | 功能 | 关键参数 |
| --- | --- | --- |
| `apifox_generate_openapi` | 扫描本地控制器生成 OAS（仅返回 JSON） | `projectRoot`、`patterns`、`serverUrl` |
| `apifox_export_openapi` | 通过官方 API 导出 OpenAPI/Swagger | `scopeType`、`includedByTags`、`exportFormat` |
| `apifox_import_openapi` | 导入 OpenAPI 字符串/文件到 Apifox | `endpointOverwriteBehavior`、`dryRun` |
| `apifox_search_openapi` | 在 Apifox 项目的 OpenAPI 文档中按关键字搜索接口 | `keyword`、`maxResults` |
| `apifox_get_operation_detail` | 按 path + method 精确获取单个接口的详细 OpenAPI Operation | `path`、`method` |
| `apifox_get_operation_by_id` | 按 operationId 精确获取单个接口的详细 OpenAPI Operation | `operationId` |
| `apifox_get_request_schema` | 按 path + method 获取接口的请求参数与请求体定义 | `path`、`method` |
| `apifox_sync_controllers` | 扫描→生成→立即导入，形成增量/覆盖同步 | `projectRoot`、`patterns`、`ignorePatterns`、`endpointOverwriteBehavior` |
| `apifox_run_cli_test` | 触发 `apifox-cli run`，支持 reporter/上传报告 | `scenarioId`/`collectionId`、`reportFormats`、`uploadReport` |

每个工具都会返回文本结果，可在 MCP 客户端中进一步解析或保存。

## 工具详解

### 1. 接口管理 / 文档查询类

#### `apifox_export_openapi`
- **作用**：通过 Apifox 官方 API，将项目中的接口导出为 OpenAPI/Swagger 文档（JSON 或 YAML）。
- **典型场景**：和本地生成的 OpenAPI 做 diff，对齐接口定义；或导出给其它工具使用。
- **主要参数**：
  - `projectId?: string`：不填则使用环境变量 `APIFOX_PROJECT_ID`。
  - `scopeType?: 'ALL' | 'TAGS' | 'FOLDERS'`：导出范围，默认 `ALL`。
  - `includedByTags?: string[]` / `excludedByTags?: string[]`：按标签筛选/排除接口（`scopeType = TAGS` 时生效）。
  - `folderIds?: number[]`：指定导出某些分组下的接口（`scopeType = FOLDERS`）。
  - `includeExtensions?: boolean`：是否包含 `x-apifox-*` 扩展字段，默认 `true`。
  - `addFoldersToTags?: boolean`：是否把目录信息拼到 `tags`，默认 `true`。
  - `oasVersion?: '3.1' | '3.0' | '2.0'`：OpenAPI 版本，默认 `3.1`。
  - `exportFormat?: 'JSON' | 'YAML'`：导出格式，默认 `JSON`。
  - `branchId?: number` / `moduleId?: number` / `locale?: string`。

#### `apifox_import_openapi`
- **作用**：将 OpenAPI 字符串或文件导入 Apifox，支持智能合并、覆盖策略等。
- **典型场景**：从别的网关/代码生成 OpenAPI 后，批量导入到 Apifox 管理。
- **主要参数**：
  - `projectId?: string`：不填则使用环境变量。
  - `openapi?: string`：OpenAPI/Swagger 文本（JSON 或 YAML）。
  - `filePath?: string`：OpenAPI 文件路径（当 `openapi` 为空时从文件读取）。
  - `endpointOverwriteBehavior`：接口覆盖策略，`OVERWRITE_EXISTING` / `IGNORE_EXISTING` / `KEEP_BOTH` / `SMART_MERGE`，默认 `SMART_MERGE`。
  - `schemaOverwriteBehavior`：数据模型覆盖策略，默认 `OVERWRITE_EXISTING`。
  - 其它布尔开关：`updateFolderOfChangedEndpoint`、`prependBasePath`、`intelligentMerge`。
  - `locale?: string`、`dryRun?: boolean`：dry-run 时只返回将要导入的内容，不真正调用 API。

#### `apifox_search_openapi`
- **作用**：基于导出的 OpenAPI 文档，在整个项目的接口中按关键字模糊搜索。
- **搜索范围**：`path`、`summary`、`description`、`tags`、`operationId`、`x-apifox-folder`、`x-apifox-name`。
- **主要参数**：
  - `keyword: string`：搜索关键字（必填）。
  - `maxResults?: number`：最大返回条数（1～100，默认 20）。
  - `locale?: string`：导出 OpenAPI 时使用的语言，不填走配置。
  - `forceRefresh?: boolean`：是否强制重新从 Apifox 导出一次 OpenAPI，而不是使用内存缓存。
- **返回**：一段摘要文本 + 一段 JSON 数组（接口列表），每项包含 `method/path/summary/tags/folder/operationId`。

#### `apifox_get_operation_detail`
- **作用**：根据 `path + method` 精确获取一个接口的完整 OpenAPI Operation。
- **主要参数**：
  - `path: string`：接口路径，例如 `/users/{id}`。
  - `method: string`：HTTP 方法，例如 `GET` / `post`（不区分大小写）。
  - `locale?: string`、`forceRefresh?: boolean`。
- **返回**：包含 `path/method/folder/name/operation` 的 JSON，其中 `operation` 是完整的 OpenAPI Operation 对象（parameters/requestBody/responses/...）。

#### `apifox_get_operation_by_id`
- **作用**：根据 `operationId` 精确获取一个接口的完整 OpenAPI Operation。
- **主要参数**：
  - `operationId: string`（必填）。
  - `locale?: string`、`forceRefresh?: boolean`。
- **返回**：包含 `path/method/folder/name/operationId/operation` 的 JSON。

#### `apifox_get_request_schema`
- **作用**：按 `path + method` 获取接口的请求定义（参数 + 请求体），方便生成调用示例或客户端代码。
- **主要参数**：
  - `path: string`、`method: string`。
  - `locale?: string`、`forceRefresh?: boolean`。
- **返回**：包含 `parameters`（合并 path 级别和 operation 级别）与 `requestBody` 的 JSON。

### 2. 代码扫描 / 同步类

#### `apifox_generate_openapi`
- **作用**：扫描本地项目中的 Controller / Router，生成 OpenAPI 3.1 文档，仅返回 JSON，不写入 Apifox。
- **主要参数**：
  - `projectRoot?: string`：项目根目录，默认当前工作目录。
  - `patterns?: string[]`：Controller/Routing 文件的 glob 列表，不传则使用内置默认：
    - `src/**/*controller.{ts,tsx,js,jsx}`
    - `src/**/*Controller.{ts,tsx,js,jsx}`
    - `src/**/*router.{ts,tsx,js,jsx}`
    - `src/**/*Router.{ts,tsx,js,jsx}`
    - `src/**/routes/**/*.{ts,tsx,js,jsx}`
  - `title?: string` / `version?: string` / `description?: string`：用于 OpenAPI `info` 字段。
  - `serverUrl?: string`：写入 OpenAPI `servers[0].url`。
- **解析逻辑（简要）**：
  - **NestJS**：识别 `@Controller()` + `@Get/@Post/...` 装饰器，自动拼接 basePath + methodPath，tag 来自类名去掉 `Controller` 后的部分。
  - **Express**：识别 `router.get('/path', ...)` 这一类调用；tag 默认使用文件所在目录名（去掉 `-/_`）。
  - 自动生成：
    - `operationId`：`<tag>_<method>_<sanitizedPath>` 形式，便于后续按 `operationId` 查找。
    - `x-apifox-folder`：基于 `projectRoot` 的相对路径，作为 Apifox 目录。
    - `summary`：优先取方法上的 JSDoc 注释，否则使用 `ClassName.methodName`。

#### `apifox_sync_controllers`
- **作用**：在 `apifox_generate_openapi` 的基础上，生成 OpenAPI 文档后立即通过 Apifox 官方 API 导入/同步到指定项目。
- **典型场景**：把当前代码库视为“真相源”，一键同步到 Apifox（支持智能合并策略）。
- **主要参数**：
  - `projectRoot?: string`：项目根目录，建议指向包含 `src` 的目录。
  - `patterns?: string[]`：Controller/Routing 文件的 glob 列表；不填时使用上述默认规则。
  - `ignorePatterns?: string[]`：忽略规则，例如：
    - `["**/node_modules/**", "**/*.spec.ts", "**/*.test.ts"]`
  - `title` / `version` / `description` / `serverUrl`：同 `apifox_generate_openapi`。
  - `projectId?: string`：不填走环境变量。
  - `endpointOverwriteBehavior`：接口覆盖策略（默认 `SMART_MERGE`）。
  - `schemaOverwriteBehavior`：数据模型覆盖策略（默认 `OVERWRITE_EXISTING`）。
  - `dryRun?: boolean`：为 `true` 时只返回生成的 OpenAPI，不调用 Apifox。
- **推荐用法**：
  1. 先用 `dryRun: true` 看看扫描到了哪些接口、生成的 OpenAPI 是否符合预期。
  2. 确认无误后，去掉 `dryRun`，根据需要选择 `SMART_MERGE` 或 `OVERWRITE_EXISTING` 等策略真正同步到 Apifox。

### 3. 测试联动类

#### `apifox_run_cli_test`
- **作用**：封装 `apifox-cli run`，自动注入 Access Token / Project ID，执行测试场景或集合。
- **典型场景**：从 MCP 客户端一键触发接口自动化测试，并把报告摘要返回到对话中。
- **主要参数（简要）**：
  - `scenarioId?: number` / `collectionId?: number`：二选一。
  - `reportFormats?: string[]`：如 `["html", "cli"]`。
  - `uploadReport?: 'none' | 'summary' | 'detail'`：是否把报告上传到 Apifox。
  - 其它参数见 `src/tools/runCliTest.ts`。

## 快速上手
1. **生成草稿**：`apifox_generate_openapi`，确认扫描到的接口数与摘要。
2. **比对线上**：`apifox_export_openapi`，与本地输出做 diff。
3. **同步**：使用 `apifox_sync_controllers`（自动写回）或 `apifox_import_openapi`（手动导入）。
4. **测试**：`apifox_run_cli_test --scenarioId=<ID> -r html,cli --upload-report detail`，在 Apifox 查看报告。

## 控制器扫描说明
- 默认匹配 `src/**/*Controller.*`、`src/**/*controller.*`、`src/**/*router.*`、`src/**/routes/**`
- 支持 **NestJS 装饰器**（`@Controller` + `@Get/@Post/...`）与 **Express Router** 调用
- 自动生成 `x-apifox-folder`（来自文件相对路径）、`operationId`，并保留 JSDoc 注释作为摘要
- 可通过 `patterns` 参数自定义 glob 表达式

## 测试
项目内置 Vitest 示例：
```bash
npm test
```
`tests/controllerScanner.test.ts` 使用临时目录验证扫描与 OAS 构建逻辑，可作为扩展更多测试的模板。

## 项目结构
```
mcp-apifox-server/
├── src/
│   ├── config.ts          # 配置解析
│   ├── server.ts          # MCP Server + STDIO 启动
│   ├── tools/             # MCP 工具注册实现
│   ├── services/          # Apifox API 客户端、控制器扫描、OpenAPI Builder
│   └── utils/             # 日志、命令执行等通用工具
├── tests/                 # Vitest 用例
├── package.json
├── tsconfig.json
└── README.md
```

## 贡献指南
欢迎通过 Issue / PR 提交改进（新增控制器解析、更多 Apifox 工具、CLI 输出优化等）。提交前请确保通过 `npm test`。

## 许可证
暂未声明，默认遵循仓库根目录的授权策略；如需独立授权，可在后续提交中补充 LICENSE。
