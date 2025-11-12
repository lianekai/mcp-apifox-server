import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import pkg from '../package.json' with { type: 'json' };
import { getConfig, type ApifoxConfig } from './config.js';
import { logger } from './utils/logger.js';
import { registerTools } from './tools/index.js';

function validateConfig(config: ApifoxConfig): void {
  const missing: string[] = [];
  if (!config.accessToken) missing.push('APIFOX_ACCESS_TOKEN');
  if (!config.projectId) missing.push('APIFOX_PROJECT_ID');
  if (missing.length > 0) {
    logger.warn(
      {
        missing,
      },
      '[Apifox MCP] 缺少关键配置，将无法调用官方 API。可通过环境变量或 CLI 参数设置。'
    );
  }
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'Apifox MCP Server',
    version: pkg.version ?? '0.0.0',
  });
  registerTools(server);
  return server;
}

export async function startServer(): Promise<void> {
  const config = getConfig();
  validateConfig(config);
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('[Apifox MCP] Server 已启动');
}
