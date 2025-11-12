import { startServer } from './server.js';

startServer().catch((error) => {
  console.error('[Apifox MCP] 启动失败', error);
  process.exitCode = 1;
});
