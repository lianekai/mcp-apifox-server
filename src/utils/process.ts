import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
  captureStdoutToFile?: boolean;
}

export interface RunCommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {},
): Promise<RunCommandResult> {
  const maxOutputBytes = options.maxOutputBytes ?? 8 * 1024 * 1024;
  const directory = options.captureStdoutToFile
    ? await fs.mkdtemp(path.join(os.tmpdir(), 'apifox-output-'))
    : undefined;
  let outputFile: fs.FileHandle | undefined;
  try {
    if (directory)
      outputFile = await fs.open(path.join(directory, 'stdout'), 'w+', 0o600);
    const result = await new Promise<RunCommandResult>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: ['ignore', outputFile?.fd ?? 'pipe', 'pipe'],
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let outputBytes = 0;
      let failure: Error | undefined;
      const collectOutput = (chunks: Buffer[], chunk: Buffer): void => {
        if (failure) return;
        outputBytes += chunk.length;
        if (outputBytes > maxOutputBytes) {
          failure = new Error(`命令输出超过限制 (${maxOutputBytes} bytes)`);
          child.kill('SIGKILL');
          return;
        }
        chunks.push(chunk);
      };

      child.stdout?.on('data', (chunk: Buffer) =>
        collectOutput(stdoutChunks, chunk),
      );
      child.stderr?.on('data', (chunk: Buffer) =>
        collectOutput(stderrChunks, chunk),
      );

      let timeout: NodeJS.Timeout | undefined;
      const outputMonitor = outputFile
        ? setInterval(() => {
            void outputFile
              ?.stat()
              .then((stat) => {
                if (!failure && stat.size + outputBytes > maxOutputBytes) {
                  failure = new Error(
                    `命令输出超过限制 (${maxOutputBytes} bytes)`,
                  );
                  child.kill('SIGKILL');
                }
              })
              .catch(() => {});
          }, 50)
        : undefined;
      if (options.timeoutMs) {
        timeout = setTimeout(() => {
          failure = new Error(`命令超时 (${options.timeoutMs}ms): ${command}`);
          child.kill('SIGKILL');
        }, options.timeoutMs);
      }

      child.on('close', (code) => {
        if (timeout) clearTimeout(timeout);
        if (outputMonitor) clearInterval(outputMonitor);
        if (failure) {
          reject(failure);
          return;
        }
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
          code,
        });
      });

      child.on('error', (error) => {
        if (timeout) clearTimeout(timeout);
        if (outputMonitor) clearInterval(outputMonitor);
        reject(error);
      });
    });
    if (outputFile && directory) {
      const stat = await outputFile.stat();
      if (stat.size + Buffer.byteLength(result.stderr) > maxOutputBytes)
        throw new Error(`命令输出超过限制 (${maxOutputBytes} bytes)`);
      result.stdout = await fs.readFile(path.join(directory, 'stdout'), 'utf8');
    }
    return result;
  } finally {
    await outputFile?.close();
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  }
}
