import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { OpenAPIV3_1 } from 'openapi-types';

import { loadOpenApiDocument } from '../services/openApiDocument.js';

const requestInputSchema = {
  path: z
    .string()
    .min(1, 'path 不能为空')
    .describe('接口路径，例如 /users/{id}'),
  method: z
    .string()
    .min(1, 'method 不能为空')
    .describe('HTTP 方法，例如 GET、POST（不区分大小写）'),
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

const requestSchema = z.object(requestInputSchema);

export type GetRequestSchemaParams = z.infer<typeof requestSchema>;

function normalizeMethod(
  method: string
): keyof OpenAPIV3_1.PathItemObject | undefined {
  const lower = method.toLowerCase();
  const supported: (keyof OpenAPIV3_1.PathItemObject)[] = [
    'get',
    'post',
    'put',
    'delete',
    'patch',
    'options',
    'head',
  ];
  return supported.includes(lower as keyof OpenAPIV3_1.PathItemObject)
    ? (lower as keyof OpenAPIV3_1.PathItemObject)
    : undefined;
}

export function registerGetRequestSchemaTool(server: McpServer): void {
  server.registerTool(
    'apifox_get_request_schema',
    {
      title: '根据 path + method 获取接口的请求参数与请求体定义',
      description:
        '基于已导出的 OpenAPI 文档，按 path + HTTP method 精确定位一个接口，仅返回请求相关的信息（parameters + requestBody），便于生成调用示例或客户端代码。',
      inputSchema: requestInputSchema,
    },
    async (args: GetRequestSchemaParams) => {
      try {
        const document = await loadOpenApiDocument({
          locale: args.locale,
          forceRefresh: args.forceRefresh,
        });

        const normalizedMethod = normalizeMethod(args.method);
        if (!normalizedMethod) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `不支持的 HTTP 方法：${args.method}，请使用 GET/POST/PUT/DELETE/PATCH/OPTIONS/HEAD。`,
              },
            ],
          };
        }

        const paths = document.paths ?? {};
        const pathItem = paths[args.path] as
          | OpenAPIV3_1.PathItemObject
          | undefined;
        if (!pathItem) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `在 OpenAPI 文档中未找到路径：${args.path}。`,
              },
            ],
          };
        }

        const operation = pathItem[normalizedMethod] as
          | OpenAPIV3_1.OperationObject
          | undefined;

        if (!operation) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `在路径 ${args.path} 下未找到方法 ${normalizedMethod.toUpperCase()} 对应的接口。`,
              },
            ],
          };
        }

        const folder = (operation as Record<string, unknown>)['x-apifox-folder'];
        const name = (operation as Record<string, unknown>)['x-apifox-name'];

        const pathLevelParams =
          (pathItem.parameters as OpenAPIV3_1.ParameterObject[] | undefined) ??
          [];
        const opLevelParams =
          (operation.parameters as OpenAPIV3_1.ParameterObject[] | undefined) ??
          [];

        const parameters = [...pathLevelParams, ...opLevelParams];

        const payload = {
          path: args.path,
          method: normalizedMethod,
          folder: typeof folder === 'string' ? folder : undefined,
          name: typeof name === 'string' ? name : undefined,
          operationId: operation.operationId,
          summary: operation.summary,
          description: operation.description,
          parameters,
          requestBody: operation.requestBody,
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: `已获取请求定义：${normalizedMethod.toUpperCase()} ${args.path}${
                typeof name === 'string' ? `（${name}）` : ''
              }。`,
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
              text: `获取请求定义失败：${
                (err as Error)?.message ?? String(err)
              }`,
            },
          ],
        };
      }
    }
  );
}

