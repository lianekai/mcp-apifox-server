import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { scanControllers } from '../src/services/controllerScanner.js';
import { buildOpenApiFromRoutes } from '../src/services/openApiBuilder.js';

async function createTempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apifox-mcp-'));
  await fs.mkdir(path.join(dir, 'src', 'users'), { recursive: true });
  const controllerFile = path.join(dir, 'src', 'users', 'users.controller.ts');
  await fs.writeFile(
    controllerFile,
    `import { Controller, Get } from '@nestjs/common';

@Controller('users')
export class UsersController {
  /**
   * 获取用户列表
   */
  @Get('/')
  findAll() {
    return [];
  }
}
`
  );

  await fs.mkdir(path.join(dir, 'src', 'routes'), { recursive: true });
  const routerFile = path.join(dir, 'src', 'routes', 'health.router.ts');
  await fs.writeFile(
    routerFile,
    `import { Router } from 'express';
const router = Router();
router.get('/health', (_req, res) => res.send('ok'));
export default router;
`
  );

  return dir;
}

describe('controller scanner + openapi builder', () => {
  it('extracts routes and builds OpenAPI document', async () => {
    const tmp = await createTempProject();
    try {
      const routes = await scanControllers({
        cwd: tmp,
        patterns: ['src/**/*.controller.ts', 'src/routes/**/*.ts'],
      });

      expect(routes.length).toBeGreaterThanOrEqual(2);

      const document = buildOpenApiFromRoutes(routes, {
        title: 'Test APIs',
        version: '0.0.1',
      });

      expect(document.paths?.['/users']).toBeDefined();
      expect(document.paths?.['/health']).toBeDefined();
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
