import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerExportOpenApiTool } from './exportOpenApi.js';
import { registerImportOpenApiTool } from './importOpenApi.js';
import { registerGenerateOpenApiTool } from './generateOpenApi.js';
import { registerSyncControllersTool } from './syncControllers.js';
import { registerRunCliTestTool } from './runCliTest.js';

export function registerTools(server: McpServer): void {
  registerGenerateOpenApiTool(server);
  registerExportOpenApiTool(server);
  registerImportOpenApiTool(server);
  registerSyncControllersTool(server);
  registerRunCliTestTool(server);
}
