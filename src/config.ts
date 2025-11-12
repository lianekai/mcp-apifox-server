import dotenv from 'dotenv';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

dotenv.config({ quiet: true });

export interface ApifoxConfig {
  accessToken: string;
  projectId: string;
  apiVersion: string;
  apiBaseUrl: string;
  locale: string;
  cliExecutable: string;
}

const DEFAULTS: ApifoxConfig = {
  accessToken: '',
  projectId: '',
  apiVersion: '2024-03-28',
  apiBaseUrl: 'https://api.apifox.com/v1',
  locale: 'zh-CN',
  cliExecutable: 'apifox',
};

const runtimeOverrides: Partial<ApifoxConfig> = {};

const argv = yargs(hideBin(process.argv))
  .option('accessToken', {
    type: 'string',
    describe: 'Apifox Access Token (Bearer)',
  })
  .option('projectId', {
    type: 'string',
    describe: 'Apifox 项目 ID',
  })
  .option('apiVersion', {
    type: 'string',
    describe: 'Apifox OpenAPI 版本号头 X-Apifox-Api-Version',
  })
  .option('apiBaseUrl', {
    type: 'string',
    describe: 'Apifox OpenAPI 域名，默认 https://api.apifox.com/v1',
  })
  .option('locale', {
    type: 'string',
    describe: 'Apifox API locale（如 zh-CN、en-US）',
  })
  .option('cliExecutable', {
    type: 'string',
    describe: 'apifox-cli 可执行文件名或绝对路径',
  })
  .option('version', {
    type: 'boolean',
    describe: '打印版本信息',
  })
  .help(false)
  .version(false)
  .parseSync();

export function setConfig(partial: Partial<ApifoxConfig>): void {
  Object.assign(runtimeOverrides, partial);
}

function resolveValue(key: keyof ApifoxConfig, envKey: string): string {
  const env = process.env[envKey];
  return (
    runtimeOverrides[key] ??
    (argv[key] as string | undefined) ??
    env ??
    DEFAULTS[key]
  );
}

export function getConfig(): ApifoxConfig {
  return {
    accessToken: resolveValue('accessToken', 'APIFOX_ACCESS_TOKEN'),
    projectId: resolveValue('projectId', 'APIFOX_PROJECT_ID'),
    apiVersion: resolveValue('apiVersion', 'APIFOX_API_VERSION'),
    apiBaseUrl: resolveValue('apiBaseUrl', 'APIFOX_API_BASE_URL'),
    locale: resolveValue('locale', 'APIFOX_LOCALE'),
    cliExecutable: resolveValue('cliExecutable', 'APIFOX_CLI'),
  };
}

export function shouldShowVersion(): boolean {
  return Boolean(argv.version);
}
