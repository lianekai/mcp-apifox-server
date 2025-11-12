import fs from 'node:fs/promises';
import path from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { ApifoxClient } from '../services/apifoxClient.js';

const overwriteBehaviorEnum = z.enum([
  'OVERWRITE_EXISTING',
  'IGNORE_EXISTING',
  'KEEP_BOTH',
  'SMART_MERGE',
]);

const importInputSchema = {
  projectId: z.string().describe('Apifox 项目 ID，默认读取配置').optional(),
  verbose: z
    .boolean()
    .describe('是否返回更详细的导入结果（包含原始响应 JSON）')
    .default(false)
    .optional(),
  openapi: z
    .string()
    .describe('OpenAPI/Swagger 字符串内容（JSON 或 YAML）')
    .optional(),
  filePath: z
    .string()
    .describe('OpenAPI/Swagger 文件路径，当 openapi 为空时读取该文件')
    .optional(),
  endpointOverwriteBehavior: overwriteBehaviorEnum
    .describe('接口覆盖策略')
    .default('SMART_MERGE'),
  schemaOverwriteBehavior: overwriteBehaviorEnum
    .describe('数据模型覆盖策略')
    .default('SMART_MERGE'),
  updateFolderOfChangedEndpoint: z
    .boolean()
    .describe('是否同步更新接口所在目录')
    .default(true),
  prependBasePath: z
    .boolean()
    .describe('是否把 basePath 前缀加入 URL')
    .default(false),
  intelligentMerge: z
    .boolean()
    .describe('是否启用 Apifox 智能合并（保留中文描述、Mock 等）')
    .default(true),
  locale: z.string().describe('API locale, 默认 zh-CN').optional(),
  dryRun: z
    .boolean()
    .describe('若为 true，只返回将要导入的内容，不真正调用 API')
    .default(false),
};

const importSchema = z.object(importInputSchema);

export type ImportOpenApiParams = z.infer<typeof importSchema>;

export function registerImportOpenApiTool(server: McpServer): void {
  server.registerTool(
    'apifox_import_openapi',
    {
      title: '将 OpenAPI 文档导入 Apifox',
      description:
        '支持直接传入 OpenAPI 字符串或文件路径，可选择覆盖策略与智能合并',
      inputSchema: importInputSchema,
    },
    async (args: ImportOpenApiParams) => {
      const payload = args.openapi ?? (await readFileIfNeeded(args.filePath));
      if (!payload) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: '必须提供 openapi 或 filePath 参数。',
            },
          ],
        };
      }

      if (args.dryRun) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Dry-run：以下内容将会导入到 Apifox：',
            },
            {
              type: 'text' as const,
              text: payload.slice(0, 2000),
            },
          ],
        };
      }

      try {
        const client = new ApifoxClient();
        const response = await client.importOpenApi({
          projectId: args.projectId,
          input: {
            content: payload,
          },
          options: {
            endpointOverwriteBehavior: args.endpointOverwriteBehavior,
            schemaOverwriteBehavior: args.schemaOverwriteBehavior,
            updateFolderOfChangedEndpoint: args.updateFolderOfChangedEndpoint,
            prependBasePath: args.prependBasePath,
            intelligentMerge: args.intelligentMerge,
          },
          locale: args.locale,
        });

        const contents: Array<{ type: 'text'; text: string }> = [
          {
            type: 'text' as const,
            text: formatCounters(response.data?.counters),
          },
        ];

        if (args.verbose) {
          contents.push({
            type: 'text' as const,
            text: `Raw response:\n${safeJSONStringify(response, 2).slice(0, 8000)}`,
          });
        }

        return {
          content: contents,
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `导入失败：${(err as Error)?.message ?? String(err)}`,
            },
            ...(args.verbose
              ? [
                  {
                    type: 'text' as const,
                    text: `错误详情：${safeJSONStringify(err, 2).slice(0, 4000)}`,
                  },
                ]
              : []),
          ],
        };
      }
    }
  );
}

async function readFileIfNeeded(filePath?: string): Promise<string | undefined> {
  if (!filePath) return undefined;
  const absolute = path.resolve(filePath);
  return fs.readFile(absolute, 'utf8');
}

function formatCounters(
  counters?: Record<string, number>
): string {
  if (!counters) return '已成功触发导入，Apifox 将在客户端显示详细日志。';
  const lines = Object.entries(counters)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  return `导入完成，结果如下：\n${lines}`;
}

function safeJSONStringify(value: unknown, space?: number): string {
  try {
    return JSON.stringify(value, getCircularReplacer(), space);
  } catch {
    return '[Unserializable JSON]';
  }
}

function getCircularReplacer(): (this: unknown, key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();
  return function (_key, value) {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value as object)) {
        return '[Circular]';
      }
      seen.add(value as object);
    }
    return value;
  };
}
