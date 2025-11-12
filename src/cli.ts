#!/usr/bin/env node
import pkg from '../package.json' with { type: 'json' };
import { shouldShowVersion } from './config.js';
import { startServer } from './server.js';

if (shouldShowVersion()) {
  console.log(pkg.version ?? '0.0.0');
  process.exit(0);
}

startServer().catch((error) => {
  console.error('[Apifox MCP] CLI 启动失败', error);
  process.exitCode = 1;
});
