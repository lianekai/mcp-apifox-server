import type { OpenAPIV3_1 } from 'openapi-types';

import { ApifoxClient } from './apifoxClient.js';

export interface LoadOpenApiOptions {
  locale?: string;
  forceRefresh?: boolean;
}

let cachedDocument: OpenAPIV3_1.Document | null = null;
let cachedLocale: string | undefined;

export async function loadOpenApiDocument(
  options: LoadOpenApiOptions = {}
): Promise<OpenAPIV3_1.Document> {
  const { locale, forceRefresh = false } = options;

  if (
    cachedDocument &&
    !forceRefresh &&
    (locale === undefined || locale === cachedLocale)
  ) {
    return cachedDocument;
  }

  const client = new ApifoxClient();
  const result = await client.exportOpenApi({
    scope: { type: 'ALL' },
    options: {
      includeApifoxExtensionProperties: true,
      addFoldersToTags: true,
    },
    oasVersion: '3.1',
    exportFormat: 'JSON',
    locale,
  });

  let doc: unknown = result;

  if (typeof result === 'string') {
    try {
      doc = JSON.parse(result) as unknown;
    } catch {
      throw new Error('导出的 OpenAPI 文档解析 JSON 失败');
    }
  }

  // 检查返回的数据结构
  if (!doc || typeof doc !== 'object') {
    throw new Error(
      `导出的 OpenAPI 文档格式不正确：返回的数据不是对象。实际返回：${JSON.stringify(doc).substring(0, 200)}`
    );
  }

  // 检查是否有 paths 字段，如果没有，可能是空项目或权限问题
  if (!('paths' in doc)) {
    const docStr = JSON.stringify(doc, null, 2);
    const { getConfig } = await import('../config.js');
    const config = getConfig();
    throw new Error(
      `导出的 OpenAPI 文档格式不正确（缺少 paths 字段）。请检查：\n` +
      `1. 项目 ID 是否正确（当前: ${config.projectId || '未配置'}）\n` +
      `2. Access Token 是否有权限访问该项目\n` +
      `3. 项目中是否有接口文档\n` +
      `4. API 返回内容：\n${docStr.substring(0, 500)}`
    );
  }

  cachedDocument = doc as OpenAPIV3_1.Document;
  cachedLocale = locale;
  return cachedDocument;
}

export function clearOpenApiCache(): void {
  cachedDocument = null;
  cachedLocale = undefined;
}

