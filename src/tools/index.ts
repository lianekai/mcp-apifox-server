import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerExportOpenApiTool } from './exportOpenApi.js';
import { registerImportOpenApiTool } from './importOpenApi.js';
import { registerGenerateOpenApiTool } from './generateOpenApi.js';
import { registerGetOperationByIdTool } from './getOperationById.js';
import { registerGetOperationDetailTool } from './getOperationDetail.js';
import { registerGetRequestSchemaTool } from './getRequestSchema.js';
import { registerSearchOpenApiTool } from './searchOpenApi.js';
import { registerSyncControllersTool } from './syncControllers.js';
import { registerRunCliTestTool } from './runCliTest.js';
import { registerProjectOasTools } from './projectOas.js';

export function registerTools(server: McpServer): void {
  // 兼容官方 apifox-mcp-server 的三大核心工具（read/refresh_project_oas_* 系列）
  registerProjectOasTools(server);

  registerGenerateOpenApiTool(server);
  registerExportOpenApiTool(server);
  registerImportOpenApiTool(server);
  registerGetOperationByIdTool(server);
  registerGetOperationDetailTool(server);
  registerGetRequestSchemaTool(server);
  registerSearchOpenApiTool(server);
  registerSyncControllersTool(server);
  registerRunCliTestTool(server);
}
