import type { OpenAPIV3_1 } from 'openapi-types';
import { createHash } from 'node:crypto';

import { ApifoxClient } from './apifoxClient.js';
import { getConfig } from '../config.js';
import { getOpenApiCacheRevision, invalidateOpenApiCache } from './openApiCache.js';

export interface LoadOpenApiOptions {
  projectId?: string;
  branchId?: number;
  moduleId?: number;
  locale?: string;
  forceRefresh?: boolean;
}

const documents = new Map<string, { document: OpenAPIV3_1.Document; expiresAt: number }>();
let cacheRevision = getOpenApiCacheRevision();

export async function loadOpenApiDocument(
  options: LoadOpenApiOptions = {}
): Promise<OpenAPIV3_1.Document> {
  const config = getConfig();
  const { locale = config.locale, forceRefresh = false, projectId = config.projectId, branchId, moduleId } = options;
  const revision = getOpenApiCacheRevision();
  if (cacheRevision !== revision) {
    documents.clear();
    cacheRevision = revision;
  }
  const key = JSON.stringify([config.apiBaseUrl, config.apiVersion,
    createHash('sha256').update(config.accessToken).digest('hex'), projectId, branchId, moduleId, locale]);
  const cached = documents.get(key);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.document;

  const client = new ApifoxClient();
  const result = await client.exportOpenApi({
    projectId,
    branchId,
    moduleId,
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
    throw new Error(
      `导出的 OpenAPI 文档格式不正确（缺少 paths 字段）。请检查：\n` +
      `1. 项目 ID 是否正确（当前: ${projectId || '未配置'}）\n` +
      `2. Access Token 是否有权限访问该项目\n` +
      `3. 项目中是否有接口文档\n` +
      `4. API 返回内容：\n${docStr.substring(0, 500)}`
    );
  }

  const document = doc as OpenAPIV3_1.Document;
  if (revision === getOpenApiCacheRevision()) {
    if (documents.size >= 20) documents.clear();
    documents.set(key, { document, expiresAt: Date.now() + 60000 });
  }
  return document;
}

export function clearOpenApiCache(): void {
  documents.clear();
  invalidateOpenApiCache();
}

