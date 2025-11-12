import type { OpenAPIV3_1 } from 'openapi-types';
import path from 'node:path';

import type { ControllerRoute, HttpMethod } from './controllerScanner.js';

export interface BuildOpenApiOptions {
  title: string;
  version?: string;
  description?: string;
  serverUrl?: string;
  defaultResponseDescription?: string;
}

const DEFAULT_RESPONSE_DESCRIPTION = '自动生成的接口，默认返回 200 OK。';

export function buildOpenApiFromRoutes(
  routes: ControllerRoute[],
  options: BuildOpenApiOptions
): OpenAPIV3_1.Document {
  const document: OpenAPIV3_1.Document = {
    openapi: '3.1.0',
    info: {
      title: options.title,
      version: options.version ?? '1.0.0',
      description: options.description ?? '由控制器扫描结果生成',
    },
    paths: {},
    tags: [],
  };

  if (options.serverUrl) {
    document.servers = [{ url: options.serverUrl }];
  }

  const tagSet = new Set<string>();

  for (const route of routes) {
    const method = normalizeMethod(route.method);
    if (!method) continue;

    if (!document.paths[route.path]) {
      document.paths[route.path] = {};
    }

    // @ts-ignore
    const operation: OpenAPIV3_1.OperationObject = {
      summary: route.summary,
      description: `自动从 ${route.sourceFile}:${route.line} 生成 (${route.origin})`,
      tags: route.tag ? [route.tag] : undefined,
      responses: {
        '200': {
          description:
            options.defaultResponseDescription ?? DEFAULT_RESPONSE_DESCRIPTION,
        },
      },
      'x-apifox-folder': route.folder
        ? route.folder.split(path.sep).join(' / ')
        : undefined,
      operationId: buildOperationId(route, method),
    };

    (document.paths[route.path] as OpenAPIV3_1.PathItemObject)[method] =
      operation;

    if (route.tag) tagSet.add(route.tag);
  }

  if (tagSet.size > 0) {
    document.tags = Array.from(tagSet).map((name) => ({ name }));
  }

  return document;
}

function normalizeMethod(method: HttpMethod): keyof OpenAPIV3_1.PathItemObject | undefined {
  if (method === 'all') return 'get';
  return method as keyof OpenAPIV3_1.PathItemObject;
}

function buildOperationId(
  route: ControllerRoute,
  method: keyof OpenAPIV3_1.PathItemObject
): string {
  const sanitizedPath = route.path
    .replace(/\{([^}]+)\}/g, '_$1_')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return [route.tag ?? 'controller', method, sanitizedPath]
    .filter(Boolean)
    .join('_');
}
