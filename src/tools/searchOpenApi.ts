import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { OpenAPIV3_1 } from 'openapi-types';

import { loadOpenApiDocument } from '../services/openApiDocument.js';

const searchInputSchema = {
  keyword: z
    .string()
    .min(1, 'keyword 不能为空')
    .describe(
      '搜索关键字，将匹配 path、summary、description、tags、operationId、x-apifox-folder 等字段'
    ),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(100)
    .describe('最大返回条数')
    .default(20),
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

const searchSchema = z.object(searchInputSchema);

export type SearchOpenApiParams = z.infer<typeof searchSchema>;

interface SearchResultItem {
  method: string;
  path: string;
  summary?: string;
  description?: string;
  tags?: string[];
  folder?: string;
  operationId?: string;
}

function searchDocument(
  document: OpenAPIV3_1.Document,
  keyword: string,
  maxResults: number
): SearchResultItem[] {
  const results: SearchResultItem[] = [];
  const q = keyword.trim().toLowerCase();
  if (!q) return results;

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

      const folder = (operation as Record<string, unknown>)['x-apifox-folder'];
      const name = (operation as Record<string, unknown>)['x-apifox-name'];

      const haystackParts: string[] = [pathKey];

      if (operation.summary) haystackParts.push(operation.summary);
      if (operation.description) haystackParts.push(operation.description);
      if (operation.operationId) haystackParts.push(operation.operationId);
      if (operation.tags) haystackParts.push(...operation.tags);
      if (typeof folder === 'string') haystackParts.push(folder);
      if (typeof name === 'string') haystackParts.push(name);

      const haystack = haystackParts
        .filter(Boolean)
        .join(' | ')
        .toLowerCase();

      if (!haystack.includes(q)) continue;

      results.push({
        method,
        path: pathKey,
        summary: operation.summary,
        description: operation.description,
        tags: operation.tags,
        folder: typeof folder === 'string' ? folder : undefined,
        operationId: operation.operationId,
      });

      if (results.length >= maxResults) return results;
    }
  }

  return results;
}

export function registerSearchOpenApiTool(server: McpServer): void {
  server.registerTool(
    'apifox_search_openapi',
    {
      title: '在 Apifox 项目的 OpenAPI 文档中搜索接口',
      description:
        '自动从 Apifox 导出 OpenAPI（支持缓存），按路径、摘要、描述、标签、operationId、x-apifox-folder 等字段进行模糊搜索。',
      inputSchema: searchInputSchema,
    },
    async (args: SearchOpenApiParams) => {
      try {
        const document = await loadOpenApiDocument({
          locale: args.locale,
          forceRefresh: args.forceRefresh,
        });

        const results = searchDocument(
          document,
          args.keyword,
          args.maxResults ?? 20
        );

        const headerText =
          results.length === 0
            ? `未在 OpenAPI 文档中找到包含 “${args.keyword}” 的接口。`
            : `已在 OpenAPI 文档中搜索 “${args.keyword}”，命中 ${results.length} 条接口（最多返回 ${args.maxResults ?? 20} 条）。`;

        return {
          content: [
            {
              type: 'text' as const,
              text: headerText,
            },
            {
              type: 'text' as const,
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `搜索 OpenAPI 文档失败：${
                (err as Error)?.message ?? String(err)
              }`,
            },
          ],
        };
      }
    }
  );
}
