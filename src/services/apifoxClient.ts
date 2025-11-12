import type { HeadersInit, RequestInit } from 'node-fetch';
import fetch, { Headers } from 'node-fetch';

import { getConfig, type ApifoxConfig } from '../config.js';

export class ApifoxRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApifoxRequestError';
  }
}

export interface ExportOpenApiParams {
  projectId?: string;
  scope?: {
    type: 'ALL' | 'TAGS' | 'FOLDERS';
    includedByTags?: string[];
    excludedByTags?: string[];
    folderIds?: number[];
  };
  options?: {
    includeApifoxExtensionProperties?: boolean;
    addFoldersToTags?: boolean;
  };
  oasVersion?: '3.1' | '3.0' | '2.0';
  exportFormat?: 'JSON' | 'YAML';
  branchId?: number;
  moduleId?: number;
  locale?: string;
}

export interface ImportOpenApiParams {
  projectId?: string;
  input:
    | {
        content: string;
      }
    | {
        url: string;
        basicAuth?: {
          username: string;
          password: string;
        };
      };
  options?: {
    targetEndpointFolderId?: number;
    targetSchemaFolderId?: number;
    endpointOverwriteBehavior?:
      | 'OVERWRITE_EXISTING'
      | 'IGNORE_EXISTING'
      | 'KEEP_BOTH'
      | 'SMART_MERGE';
    schemaOverwriteBehavior?:
      | 'OVERWRITE_EXISTING'
      | 'IGNORE_EXISTING'
      | 'KEEP_BOTH';
    updateFolderOfChangedEndpoint?: boolean;
    prependBasePath?: boolean;
    intelligentMerge?: boolean;
  };
  locale?: string;
}

export interface ImportOpenApiResultCounters {
  endpointCreated: number;
  endpointUpdated: number;
  endpointFailed: number;
  endpointIgnored: number;
  schemaCreated: number;
  schemaUpdated: number;
  schemaFailed: number;
  schemaIgnored: number;
}

export interface ImportOpenApiResponse {
  data?: {
    counters?: ImportOpenApiResultCounters;
  };
}

export class ApifoxClient {
  private readonly config: ApifoxConfig;

  constructor(config: ApifoxConfig = getConfig()) {
    this.config = config;
  }

  private buildHeaders(extra?: HeadersInit): Headers {
    const headers = new Headers({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.accessToken}`,
      'X-Apifox-Api-Version': this.config.apiVersion,
    });
    if (extra) {
      Object.entries(extra).forEach(([key, value]) => {
        if (value !== undefined) {
          headers.set(key, String(value));
        }
      });
    }
    return headers;
  }

  private async request<T>(
    path: string,
    init: RequestInit & { method: string },
    locale?: string
  ): Promise<T> {
    const url = new URL(`${this.config.apiBaseUrl}${path}`);
    url.searchParams.set('locale', locale ?? this.config.locale);

    const response = await fetch(url, {
      ...init,
      headers: this.buildHeaders(init.headers as HeadersInit | undefined),
    });

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : undefined;

    if (!response.ok) {
      throw new ApifoxRequestError(
        `Apifox API 请求失败 ${response.status}`,
        response.status,
        payload
      );
    }

    return payload as T;
  }

  async exportOpenApi(params: ExportOpenApiParams = {}): Promise<unknown> {
    const projectId = params.projectId ?? this.config.projectId;
    if (!projectId) {
      throw new Error('缺少 projectId，无法导出 OpenAPI');
    }

    const body = {
      scope: params.scope ?? { type: 'ALL' },
      options: params.options ?? {
        includeApifoxExtensionProperties: true,
        addFoldersToTags: true,
      },
      oasVersion: params.oasVersion ?? '3.1',
      exportFormat: params.exportFormat ?? 'JSON',
      branchId: params.branchId,
      moduleId: params.moduleId,
    };

    return this.request<unknown>(
      `/projects/${projectId}/export-openapi`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      params.locale
    );
  }

  async importOpenApi(
    params: ImportOpenApiParams
  ): Promise<ImportOpenApiResponse> {
    const projectId = params.projectId ?? this.config.projectId;
    if (!projectId) {
      throw new Error('缺少 projectId，无法导入 OpenAPI');
    }

    const body = {
      input: params.input,
      options: {
        endpointOverwriteBehavior: 'SMART_MERGE',
        schemaOverwriteBehavior: 'SMART_MERGE',
        updateFolderOfChangedEndpoint: true,
        prependBasePath: false,
        intelligentMerge: true,
        ...params.options,
      },
    };

    return this.request<ImportOpenApiResponse>(
      `/projects/${projectId}/import-openapi`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      params.locale
    );
  }
}
