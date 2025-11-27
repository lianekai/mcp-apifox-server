import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { getConfig } from '../config.js';
import { runCommand } from '../utils/process.js';

const uploadReportEnum = z.enum(['none', 'simple', 'detail']);

const runInputSchema = {
  scenarioId: z
    .number()
    .describe('Apifox 测试场景 ID ( -t )')
    .optional(),
  collectionId: z
    .number()
    .describe('集合 ID ( -c )，可与 scenarioId 二选一')
    .optional(),
  environmentId: z
    .number()
    .describe('环境 ID ( -e )')
    .optional(),
  iterationCount: z
    .number()
    .int()
    .min(1)
    .describe('数据驱动循环次数 ( -n )')
    .default(1),
  reportFormats: z
    .array(z.string())
    .describe('报告格式列表 ( -r html,cli,json )')
    .optional(),
  uploadReport: uploadReportEnum
    .describe('是否上传测试报告 (--upload-report)')
    .default('none'),
  timeoutMs: z
    .number()
    .describe('命令超时时间，毫秒')
    .optional(),
  workingDirectory: z
    .string()
    .describe('执行 CLI 的工作目录')
    .optional(),
  extraArgs: z
    .array(z.string())
    .describe('附加 CLI 参数，将原样追加在命令最后')
    .optional(),
};

const runSchema = z.object(runInputSchema);

export type RunCliTestParams = z.infer<typeof runSchema>;

export function registerRunCliTestTool(server: McpServer): void {
  server.registerTool(
    'apifox_run_cli_test',
    {
      title: '调用 apifox-cli 执行测试场景',
      description:
        '自动拼装 access token、project id，可选择报告格式并上传测试结果',
      inputSchema: runInputSchema,
    },
    async (args: RunCliTestParams) => {
      if (!args.scenarioId && !args.collectionId) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: 'scenarioId 与 collectionId 至少需要提供一个。',
            },
          ],
        };
      }

      const config = getConfig();
      if (!config.accessToken) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: '缺少 APIFOX_ACCESS_TOKEN，无法运行 apifox-cli。',
            },
          ],
        };
      }

      const cliArgs = buildCliArgs(args, config.projectId, config.accessToken);
      try {
        const result = await runCommand(config.cliExecutable, cliArgs, {
          cwd: args.workingDirectory ?? process.cwd(),
          timeoutMs: args.timeoutMs,
        });

        if (result.code !== 0) {
          return {
            isError: true,
            content: [
              { type: 'text' as const, text: result.stdout.trim() },
              { type: 'text' as const, text: result.stderr.trim() },
              {
                type: 'text' as const,
                text: `apifox-cli 退出码 ${result.code}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: result.stdout.trim() || '执行成功',
            },
            { type: 'text' as const, text: result.stderr.trim() },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `apifox-cli 执行失败：${
                (error as Error)?.message ?? String(error)
              }`,
            },
          ],
        };
      }
    }
  );
}

function buildCliArgs(
  args: RunCliTestParams,
  projectId: string,
  accessToken: string
): string[] {
  const cliArgs = ['run', '--access-token', accessToken];
  if (projectId) {
    cliArgs.push('--project', projectId);
  }
  if (args.scenarioId) {
    cliArgs.push('-t', String(args.scenarioId));
  }
  if (args.collectionId) {
    cliArgs.push('-c', String(args.collectionId));
  }
  if (args.environmentId) {
    cliArgs.push('-e', String(args.environmentId));
  }
  if (args.iterationCount && args.iterationCount > 1) {
    cliArgs.push('-n', String(args.iterationCount));
  }
  if (args.reportFormats?.length) {
    cliArgs.push('-r', args.reportFormats.join(','));
  }
  if (args.uploadReport !== 'none') {
    cliArgs.push('--upload-report', args.uploadReport);
  }
  if (args.extraArgs?.length) {
    cliArgs.push(...args.extraArgs);
  }
  return cliArgs;
}
