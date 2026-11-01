/**
 * Async `uip` runner — replaces spawnSync with async spawn + Promise.
 *
 * Same contract as runUip() in config.ts but non-blocking, so multiple
 * calls can run concurrently with Promise.all.
 */
import { spawn } from 'node:child_process';
import { loadConfig } from '../config';
import type { AgentContext } from '../types';

/** Result of an async `uip` invocation (same shape as UipRunResult). */
export interface AsyncUipRunResult {
  readonly command: string;
  readonly args: readonly string[];
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/**
 * Run the `uip` CLI asynchronously with `args` in the context's cwd.
 *
 * Non-blocking: returns a Promise that resolves when the process exits.
 * Failures are returned (exitCode != 0), never thrown.
 */
export function runUipAsync(
  ctx: AgentContext,
  args: readonly string[],
  opts: { uipBin?: string } = {},
): Promise<AsyncUipRunResult> {
  const config = loadConfig({ uipBin: opts.uipBin });
  const bin = config.uipBin;

  // If the bin is a .js file (e.g. a test fake), run it with node.
  let cmd = bin;
  let cmdArgs = [...args];
  if (bin.endsWith('.js')) {
    cmd = process.execPath;
    cmdArgs = [bin, ...cmdArgs];
  }

  return new Promise((resolve) => {
    const child = spawn(cmd, cmdArgs, {
      cwd: ctx.cwd,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString('utf8');
    });
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString('utf8');
    });

    child.on('error', () => {
      resolve({
        command: bin,
        args,
        stdout: '',
        stderr: String(stderr || 'spawn error'),
        exitCode: 1,
      });
    });

    child.on('close', (code: number | null) => {
      resolve({
        command: bin,
        args,
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });
  });
}

/**
 * Run multiple `uip` calls in parallel and return all results.
 * Does NOT stop on failure — the caller decides how to aggregate.
 */
export async function runUipParallel(
  ctx: AgentContext,
  calls: readonly (readonly string[])[],
  opts: { uipBin?: string } = {},
): Promise<AsyncUipRunResult[]> {
  const promises = calls.map((args) => runUipAsync(ctx, args, opts));
  return Promise.all(promises);
}