/**
 * Configuration + the single sanctioned `uip` runner.
 *
 * Agents MUST obtain UiPath behaviour by calling `runUip` or `runUipChain`.
 * They never call UiPath HTTP APIs directly and never fabricate output.
 */
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';
import type { AgentContext, AgentResult } from './types';

/** Resolved configuration for oh-my-UiPath. */
export interface OhMyUiPathConfig {
  /** Absolute path to the `uip` CLI binary. */
  readonly uipBin: string;
  /** Absolute path to the installed UiPath skills root. */
  readonly skillsRoot: string;
  /** Default tenant, if set. */
  readonly defaultTenant?: string;
  /** Default Orchestrator folder, if set. */
  readonly defaultFolder?: string;
}

/** Load config, applying overrides and environment defaults. */
export function loadConfig(overrides: Partial<OhMyUiPathConfig> = {}): OhMyUiPathConfig {
  return {
    uipBin: overrides.uipBin ?? process.env.OMU_UIP_BIN ?? path.join(os.homedir(), '.npm-global', 'bin', 'uip'),
    skillsRoot: overrides.skillsRoot ?? process.env.OMU_SKILLS_ROOT ?? path.join(os.homedir(), '.agents', 'skills'),
    defaultTenant: overrides.defaultTenant ?? process.env.OMU_TENANT,
    defaultFolder: overrides.defaultFolder ?? process.env.OMU_FOLDER,
  };
}

/** Result of a single `uip` invocation. */
export interface UipRunResult {
  readonly command: string;
  readonly args: readonly string[];
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  /** Label for this step (used in error reporting). */
  readonly label?: string;
}

/**
 * Run the `uip` CLI synchronously with `args` in the context's cwd.
 *
 * Synchronous on purpose: each agent step is a small, bounded `uip` call and we
 * want deterministic ordering. Failures are returned (exitCode != 0), never
 * thrown — the caller decides how to aggregate.
 */
export function runUip(
  ctx: AgentContext,
  args: readonly string[],
  opts: { uipBin?: string; label?: string } = {},
): UipRunResult {
  const config = loadConfig({ uipBin: opts.uipBin });
  const bin = config.uipBin;
  // If the bin is a .js file (e.g. a test fake), run it with node.
  let cmd = bin;
  let cmdArgs = [...args];
  if (bin.endsWith('.js')) {
    cmd = process.execPath;
    cmdArgs = [bin, ...args];
  }
  const res: SpawnSyncReturns<string> = spawnSync(cmd, cmdArgs, {
    cwd: ctx.cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    command: config.uipBin,
    args,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    exitCode: res.status ?? 1,
    label: opts.label,
  };
}

/** One step in a chained `uip` call sequence. */
export interface UipStep {
  readonly args: readonly string[];
  readonly label: string;
}

/**
 * Run a sequence of `uip` calls, stopping on the first failure.
 *
 * Returns the results accumulated so far (including the failing step).
 * Steps after a failure are skipped. The `failed` property of the returned
 * object is the label of the step that failed, or undefined if all passed.
 */
export interface UipChainResult {
  readonly results: readonly UipRunResult[];
  readonly failedLabel: string | undefined;
}

export function runUipChain(
  ctx: AgentContext,
  steps: readonly UipStep[],
  opts: { uipBin?: string } = {},
): UipChainResult {
  const results: UipRunResult[] = [];
  for (const step of steps) {
    const r = runUip(ctx, step.args, { uipBin: opts.uipBin, label: step.label });
    results.push(r);
    if (r.exitCode !== 0) {
      return { results, failedLabel: step.label };
    }
  }
  return { results, failedLabel: undefined };
}

/** Format one `uip` call as a transcript line. */
function formatRun(r: UipRunResult): string {
  const head = `$ uip ${r.args.join(' ')}`;
  const body = [r.stdout, r.stderr].filter((s) => s.length > 0).join('\n');
  return body.length > 0 ? `${head}\n${body}` : head;
}

/**
 * Build an {@link AgentResult} from one or more {@link UipRunResult}s.
 * `success` is true only if every call exited 0.
 */
export function makeResult(
  agent: string,
  run: UipRunResult | readonly UipRunResult[],
  artifacts: readonly string[],
  startMs: number,
): AgentResult {
  const runs = Array.isArray(run) ? run : [run];
  const success = runs.every((r) => r.exitCode === 0);
  const failedLabel = runs.find((r) => r.exitCode !== 0)?.label;
  const output = success
    ? runs.map(formatRun).join('\n\n')
    : `${runs.map(formatRun).join('\n\n')}\n\n⚠ Step "${failedLabel}" failed (exit code ${runs.find((r) => r.exitCode !== 0)?.exitCode}). Remaining steps skipped.`;
  return {
    agent,
    success,
    output,
    artifacts,
    durationMs: Date.now() - startMs,
    exitCodes: runs.map((r) => r.exitCode),
  };
}

/** Build an {@link AgentResult} from a {@link UipChainResult}. */
export function makeChainResult(
  agent: string,
  chain: UipChainResult,
  artifacts: readonly string[],
  startMs: number,
): AgentResult {
  return makeResult(agent, chain.results, artifacts, startMs);
}

/** Convenience: build a result with no `uip` calls (e.g. dry-run / planning). */
export function planResult(
  agent: string,
  lines: readonly string[],
  artifacts: readonly string[],
  startMs: number,
): AgentResult {
  return {
    agent,
    success: true,
    output: lines.map((l) => `# ${l}`).join('\n'),
    artifacts,
    durationMs: Date.now() - startMs,
    exitCodes: [],
  };
}