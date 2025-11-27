import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { OpenAPIV3_1 } from 'openapi-types';

import { loadOpenApiDocument } from '../services/openApiDocument.js';

const byIdInputSchema = {
  operationId: z
    .string()
    .min(1, 'operationId 不能为空')
    .describe('OpenAPI 中的 operationId，通常用于标识单个接口'),
  locale: z
    .string()
    .describe('API locale, 默认 zh-CN，用于导出 OpenAPI 时的语言')
    .optional(),
  forceRefresh: z
    .boolean()
    .describe('若为 true，将强制重新从 Apifox 导出一次 OpenAPI，而不是使用缓存')
    .default(false)
    .optional(),
};

const byIdSchema = z.object(byIdInputSchema);

export type GetOperationByIdParams = z.infer<typeof byIdSchema>;

interface OperationWithLocation {
  path: string;
  method: keyof OpenAPIV3_1.PathItemObject;
  operation: OpenAPIV3_1.OperationObject;
}

function findOperationById(
  document: OpenAPIV3_1.Document,
  operationId: string
): OperationWithLocation | null {
  const target = operationId.trim();
  if (!target) return null;

  const paths = document.paths ?? {};

  const methods: (keyof OpenAPIV3_1.PathItemObject)[] = [
    'get',
    'post',
    'put',
    'delete',
    'patch',
    'options',
    'head',
  ];

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!pathItem) continue;
    const typedPathItem = pathItem as OpenAPIV3_1.PathItemObject;

    for (const method of methods) {
      const op = typedPathItem[method];
      if (!op) continue;

      const operation = op as OpenAPIV3_1.OperationObject;

      if (operation.operationId === target) {
        return { path: pathKey, method, operation };
      }
    }
  }

  return null;
}

export function registerGetOperationByIdTool(server: McpServer): void {
  server.registerTool(
    'apifox_get_operation_by_id',
    {
      title: '根据 operationId 获取单个接口的详细 OpenAPI Operation',
      description:
        '基于已导出的 OpenAPI 文档，按 operationId 精确定位一个接口，返回完整的 Operation（包括 summary/description/tags/parameters/requestBody/responses 等）。',
      inputSchema: byIdInputSchema,
    },
    async (args: GetOperationByIdParams) => {
      try {
        const document = await loadOpenApiDocument({
          locale: args.locale,
          forceRefresh: args.forceRefresh,
        });

        const located = findOperationById(document, args.operationId);
        if (!located) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `在 OpenAPI 文档中未找到 operationId 为 ${args.operationId} 的接口。`,
              },
            ],
          };
        }

        const { path, method, operation } = located;

        const folder = (operation as Record<string, unknown>)['x-apifox-folder'];
        const name = (operation as Record<string, unknown>)['x-apifox-name'];

        const payload = {
          path,
          method,
          folder: typeof folder === 'string' ? folder : undefined,
          name: typeof name === 'string' ? name : undefined,
          operationId: operation.operationId,
          operation,
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: `已根据 operationId 获取接口详情：${method.toUpperCase()} ${path}${
                typeof name === 'string' ? `（${name}）` : ''
              }（operationId=${operation.operationId ?? '未知'}）。`,
            },
            {
              type: 'text' as const,
              text: JSON.stringify(payload, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `根据 operationId 获取接口详情失败：${
                (err as Error)?.message ?? String(err)
              }`,
            },
          ],
        };
      }
    }
  );
}

