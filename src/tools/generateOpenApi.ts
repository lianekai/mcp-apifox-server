import path from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { buildOpenApiFromRoutes } from '../services/openApiBuilder.js';
import { scanControllers } from '../services/controllerScanner.js';

const generateInputSchema = {
  projectRoot: z.string().describe('项目根目录，默认当前工作目录').optional(),
  title: z.string().describe('生成的 OpenAPI 文档标题').default('Auto Generated APIs'),
  version: z.string().describe('OpenAPI 版本号 info.version').default('1.0.0'),
  description: z
    .string()
    .describe('OpenAPI 描述 info.description')
    .optional(),
  serverUrl: z.string().url().describe('服务器 URL').optional(),
  patterns: z
    .array(z.string())
    .describe('用于匹配控制器的 glob pattern 列表')
    .optional(),
};

const generateSchema = z.object(generateInputSchema);

export type GenerateOpenApiParams = z.infer<typeof generateSchema>;

export function registerGenerateOpenApiTool(server: McpServer): void {
  server.registerTool(
    'apifox_generate_openapi',
    {
      title: '解析本地控制器并生成 OpenAPI 文档',
      description:
        '扫描项目中的 Controller / Router 文件，自动生成基础版 OpenAPI 3.1 文档',
      inputSchema: generateInputSchema,
    },
    async (args: GenerateOpenApiParams) => {
      const cwd = args.projectRoot
        ? path.resolve(args.projectRoot)
        : process.cwd();
      const routes = await scanControllers({
        cwd,
        patterns: args.patterns,
      });

      if (routes.length === 0) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: '未在指定目录下找到任何控制器或路由文件，检查 glob 配置。',
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

      return {
        content: [
          {
            type: 'text' as const,
            text: `已生成 ${routes.length} 个接口的 OpenAPI 文档。`,
          },
          {
            type: 'text' as const,
            text: JSON.stringify(document, null, 2),
          },
        ],
      };
    }
  );
}
