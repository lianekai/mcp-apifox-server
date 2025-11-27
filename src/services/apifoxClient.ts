import type { HeadersInit, RequestInit } from 'node-fetch';
import fetch, { Headers } from 'node-fetch';

import { getConfig, type ApifoxConfig } from '../config.js';
import { logger } from '../utils/logger.js';

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

    logger.debug(
      {
        method: init.method,
        url: url.toString(),
        hasBody: !!init.body,
      },
      'Apifox API 请求'
    );

    const response = await fetch(url, {
      ...init,
      headers: this.buildHeaders(init.headers as HeadersInit | undefined),
    });

    const text = await response.text();
    let payload: unknown;

    logger.debug(
      {
        url: url.toString(),
        status: response.status,
        statusText: response.statusText,
        hasText: !!text,
        textLength: text?.length ?? 0,
        contentType: response.headers.get('content-type'),
      },
      'Apifox API 响应'
    );

    if (text) {
      // 优先尝试解析为 JSON，失败时保留为原始字符串，避免因为非 JSON 响应导致调用方崩溃
      try {
        payload = JSON.parse(text) as unknown;
        logger.debug(
          {
            url: url.toString(),
            payloadType: typeof payload,
            isObject: typeof payload === 'object' && payload !== null,
            keysCount: typeof payload === 'object' && payload !== null ? Object.keys(payload).length : 0,
          },
          'JSON 解析成功'
        );
      } catch (parseError) {
        logger.warn(
          {
            url: url.toString(),
            parseError: parseError instanceof Error ? parseError.message : String(parseError),
            textPreview: text.substring(0, 200),
          },
          'JSON 解析失败，返回原始文本'
        );
        payload = text;
      }
    } else {
      // 如果响应为空，记录警告
      if (response.ok) {
        logger.warn(
          {
            url: url.toString(),
            status: response.status,
          },
          'API 响应为空，但状态码为成功'
        );
        // 返回空对象而不是 undefined
        payload = {};
      } else {
        payload = undefined;
      }
    }

    if (!response.ok) {
      logger.error(
        {
          url: url.toString(),
          status: response.status,
          statusText: response.statusText,
          payload,
        },
        'Apifox API 请求失败'
      );
      throw new ApifoxRequestError(
        `Apifox API 请求失败 ${response.status}: ${response.statusText}`,
        response.status,
        payload
      );
    }

    // 如果 payload 是 undefined，记录警告并返回空对象
    if (payload === undefined) {
      logger.warn(
        {
          url: url.toString(),
          status: response.status,
        },
        'API 返回 undefined，转换为空对象'
      );
      return {} as T;
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

    logger.debug(
      {
        projectId,
        body,
      },
      '调用 Apifox export-openapi API'
    );

    const result = await this.request<unknown>(
      `/projects/${projectId}/export-openapi`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      params.locale
    );

    // 处理 Apifox API 的包装格式：{ "success": true, "data": {...} }
    let actualResult = result;
    if (
      typeof result === 'object' &&
      result !== null &&
      'success' in result &&
      'data' in result
    ) {
      const wrappedResult = result as { success: boolean; data: unknown };
      logger.debug(
        {
          projectId,
          success: wrappedResult.success,
          hasData: wrappedResult.data !== undefined,
          dataType: typeof wrappedResult.data,
          dataKeysCount:
            typeof wrappedResult.data === 'object' && wrappedResult.data !== null
              ? Object.keys(wrappedResult.data).length
              : 0,
        },
        '检测到 Apifox API 包装格式，提取 data 字段'
      );

      if (wrappedResult.success && wrappedResult.data !== undefined) {
        actualResult = wrappedResult.data;
      } else {
        logger.warn(
          {
            projectId,
            success: wrappedResult.success,
            hasData: wrappedResult.data !== undefined,
          },
          'Apifox API 返回 success=false 或 data 为空'
        );
        actualResult = wrappedResult.data ?? {};
      }
    }

    // 验证返回结果
    if (
      !actualResult ||
      (typeof actualResult === 'object' &&
        actualResult !== null &&
        Object.keys(actualResult).length === 0 &&
        !Array.isArray(actualResult))
    ) {
      logger.error(
        {
          projectId,
          actualResult,
          resultType: typeof actualResult,
          originalResult: result,
          hasSuccess: typeof result === 'object' && result !== null && 'success' in result,
          successValue:
            typeof result === 'object' && result !== null && 'success' in result
              ? (result as { success: boolean }).success
              : undefined,
        },
        'Apifox API 返回空结果（data 字段为空对象）'
      );
      // 不抛出错误，让调用方处理空结果
      // 可能是项目确实没有接口文档
    } else {
      logger.info(
        {
          projectId,
          resultType: typeof actualResult,
          isObject: typeof actualResult === 'object' && actualResult !== null,
          keysCount:
            typeof actualResult === 'object' && actualResult !== null
              ? Object.keys(actualResult).length
              : 0,
          hasOpenApi: typeof actualResult === 'object' && actualResult !== null && 'openapi' in actualResult,
        },
        'Apifox API 返回结果（已提取 data 字段）'
      );
    }

    return actualResult;
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
