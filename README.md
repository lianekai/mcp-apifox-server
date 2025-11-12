# Apifox MCP Server

## 项目简介
`mcp-apifox-server` 参考 `mcp-dm8-server` / `mcp-opengauss-server` 和 `dm-mcp-server` 的架构，封装 Apifox 官方 OpenAPI + `apifox-cli`，让支持 MCP 的客户端（Claude Desktop、Cursor、Cline、mcp-router 等）可以：

- 直接导出/导入 Apifox 项目中的接口文档
- 扫描本地项目 Controller/Router 自动生成 OpenAPI 并同步到 Apifox
- 一键调用 `apifox-cli run` 执行测试场景，回传报告日志

## 功能概览
- **接口管理**：`apifox_export_openapi`、`apifox_import_openapi` 双向同步，支持智能合并 / 覆盖策略
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
构建完成后可执行：
```bash
node dist/index.js          # 以 MCP 服务方式运行
npx mcp-apifox --version    # 查看版本
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
```json
{
  "mcpServers": {
    "apifox": {
      "command": "node",
      "args": ["/path/to/mcp-apifox-server/dist/index.js"],
      "env": {
        "APIFOX_ACCESS_TOKEN": "APS-xxxxxxxx",
        "APIFOX_PROJECT_ID": "123456"
      }
    }
  }
}
```

## 工具列表
| 工具名 | 功能 | 关键参数 |
| --- | --- | --- |
| `apifox_generate_openapi` | 扫描本地控制器生成 OAS（仅返回 JSON） | `projectRoot`、`patterns`、`serverUrl` |
| `apifox_export_openapi` | 通过官方 API 导出 OpenAPI/Swagger | `scopeType`、`includedByTags`、`exportFormat` |
| `apifox_import_openapi` | 导入 OpenAPI 字符串/文件到 Apifox | `endpointOverwriteBehavior`、`dryRun` |
| `apifox_sync_controllers` | 扫描→生成→立即导入，形成增量/覆盖同步 | `patterns`、`endpointOverwriteBehavior` |
| `apifox_run_cli_test` | 触发 `apifox-cli run`，支持 reporter/上传报告 | `scenarioId`/`collectionId`、`reportFormats`、`uploadReport` |

每个工具都会返回文本结果，可在 MCP 客户端中进一步解析或保存。

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
