import path from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { ApifoxClient } from '../services/apifoxClient.js';
import { buildOpenApiFromRoutes } from '../services/openApiBuilder.js';
import { scanControllers } from '../services/controllerScanner.js';

const endpointBehaviorEnum = z.enum([
  'OVERWRITE_EXISTING',
  'IGNORE_EXISTING',
  'KEEP_BOTH',
  'SMART_MERGE',
]);

const schemaBehaviorEnum = z.enum([
  'OVERWRITE_EXISTING',
  'IGNORE_EXISTING',
  'KEEP_BOTH',
]);

const syncInputSchema = {
  projectRoot: z.string().describe('项目根目录，默认当前工作目录').optional(),
  patterns: z
    .array(z.string())
    .describe(
      'Controller/Routing 文件的 glob pattern 列表，未提供时使用内置默认规则（适配常见 NestJS / Express 目录结构）'
    )
    .optional(),
  ignorePatterns: z
    .array(z.string())
    .describe('可选的忽略规则（glob），如 ["**/node_modules/**", "**/*.spec.ts"]')
    .optional(),
  title: z.string().describe('OpenAPI info.title').default('Auto Generated APIs'),
  version: z.string().describe('OpenAPI info.version').default('1.0.0'),
  description: z.string().describe('OpenAPI info.description').optional(),
  serverUrl: z.string().describe('servers[0].url').optional(),
  projectId: z.string().describe('Apifox 项目 ID').optional(),
  endpointOverwriteBehavior: endpointBehaviorEnum
    .describe('导入时接口覆盖策略')
    .default('SMART_MERGE'),
  schemaOverwriteBehavior: schemaBehaviorEnum
    .describe('导入时数据模型覆盖策略')
    .default('OVERWRITE_EXISTING'),
  dryRun: z
    .boolean()
    .describe('若为 true，只生成 OpenAPI，不调用 Apifox')
    .default(false),
};

const syncSchema = z.object(syncInputSchema);

export type SyncControllersParams = z.infer<typeof syncSchema>;

export function registerSyncControllersTool(server: McpServer): void {
  server.registerTool(
    'apifox_sync_controllers',
    {
      title: '扫描控制器并同步到 Apifox',
      description:
        '组合控制器扫描 + OpenAPI 构建 + Apifox 导入，实现增量或智能合并',
      inputSchema: syncInputSchema,
    },
    async (args: SyncControllersParams) => {
      const cwd = args.projectRoot
        ? path.resolve(args.projectRoot)
        : process.cwd();

      const routes = await scanControllers({
        cwd,
        patterns: args.patterns,
        ignore: args.ignorePatterns,
      });
      if (routes.length === 0) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: '未找到任何路由，无法同步。',
            },
          ],
        };
      }

      const document = buildOpenApiFromRoutes(routes, {
        title: args.title,
        version: args.version,
        description: args.description,
        serverUrl: args.serverUrl,
      });
      const documentString = JSON.stringify(document, null, 2);

      if (args.dryRun) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Dry-run：检测到 ${routes.length} 个路由，将生成 OpenAPI：`,
            },
            {
              type: 'text' as const,
              text: documentString,
            },
          ],
        };
      }

      try {
        const client = new ApifoxClient();
        const response = await client.importOpenApi({
          projectId: args.projectId,
          input: { content: documentString },
          options: {
            endpointOverwriteBehavior: args.endpointOverwriteBehavior,
            schemaOverwriteBehavior: args.schemaOverwriteBehavior,
            intelligentMerge: args.endpointOverwriteBehavior === 'SMART_MERGE',
            updateFolderOfChangedEndpoint: true,
            prependBasePath: false,
          },
        });

        return {
          content: [
            {
              type: 'text' as const,
              text:
                response.data?.counters
                  ? `同步完成：${JSON.stringify(response.data.counters)}`
                  : '已触发 Apifox 导入，详细结果请在 Apifox 客户端查看。',
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `同步到 Apifox 失败：${
                (err as Error)?.message ?? String(err)
              }`,
            },
          ],
        };
      }
    }
  );
}
