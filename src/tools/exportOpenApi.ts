import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { ApifoxClient } from '../services/apifoxClient.js';

const exportInputSchema = {
  projectId: z.string().describe('Apifox 项目 ID，默认读取配置').optional(),
  scopeType: z
    .enum(['ALL', 'TAGS', 'FOLDERS'])
    .describe('导出范围类型')
    .default('ALL'),
  includedByTags: z
    .array(z.string())
    .describe('仅导出指定标签的接口（scopeType = TAGS 时生效）')
    .optional(),
  excludedByTags: z
    .array(z.string())
    .describe('排除指定标签的接口')
    .optional(),
  folderIds: z
    .array(z.number())
    .describe('导出指定分组 ID 列表（scopeType = FOLDERS）')
    .optional(),
  includeExtensions: z
    .boolean()
    .describe('是否包含 x-apifox-* 扩展字段')
    .default(true),
  addFoldersToTags: z
    .boolean()
    .describe('是否把目录信息附加到 tags')
    .default(true),
  oasVersion: z
    .enum(['3.1', '3.0', '2.0'])
    .describe('OpenAPI 版本')
    .default('3.1'),
  exportFormat: z
    .enum(['JSON', 'YAML'])
    .describe('导出文件格式')
    .default('JSON'),
  branchId: z.number().describe('Apifox 分支 ID').optional(),
  moduleId: z.number().describe('Apifox 模块 ID').optional(),
  locale: z.string().describe('API locale, 默认 zh-CN').optional(),
};

const exportSchema = z.object(exportInputSchema);

export type ExportOpenApiParams = z.infer<typeof exportSchema>;

export function registerExportOpenApiTool(server: McpServer): void {
  server.registerTool(
    'apifox_export_openapi',
    {
      title: '从 Apifox 导出 OpenAPI/Swagger 文档',
      description: '调用官方 OpenAPI，支持按标签或分组筛选导出的接口',
      inputSchema: exportInputSchema,
    },
    async (args: ExportOpenApiParams) => {
      const client = new ApifoxClient();
      const result = await client.exportOpenApi({
        projectId: args.projectId,
        scope: {
          type: args.scopeType,
          includedByTags: args.includedByTags,
          excludedByTags: args.excludedByTags,
          folderIds: args.folderIds,
        },
        options: {
          includeApifoxExtensionProperties: args.includeExtensions,
          addFoldersToTags: args.addFoldersToTags,
        },
        oasVersion: args.oasVersion,
        exportFormat: args.exportFormat,
        branchId: args.branchId,
        moduleId: args.moduleId,
        locale: args.locale,
      });

      const payload =
        typeof result === 'string'
          ? result
          : JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: 'text' as const,
            text: `已从 Apifox 导出 OpenAPI（格式：${args.exportFormat}）。`,
          },
          {
            type: 'text' as const,
            text: payload,
          },
        ],
      };
    }
  );
}
