/**
 * Configuration + the single sanctioned `uip` runner.
 *
 * Agents MUST obtain UiPath behaviour by calling `runUip`. They never call
 * UiPath HTTP APIs directly and never fabricate output.
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

const DEFAULT_UIP_BIN =
  process.env.OMU_UIP_BIN ?? path.join(os.homedir(), '.npm-global', 'bin', 'uip');
const DEFAULT_SKILLS_ROOT =
  process.env.OMU_SKILLS_ROOT ?? path.join(os.homedir(), '.agents', 'skills');

/** Load config, applying overrides and environment defaults. */
export function loadConfig(overrides: Partial<OhMyUiPathConfig> = {}): OhMyUiPathConfig {
  return {
    uipBin: overrides.uipBin ?? DEFAULT_UIP_BIN,
    skillsRoot: overrides.skillsRoot ?? DEFAULT_SKILLS_ROOT,
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
  opts: { uipBin?: string } = {},
): UipRunResult {
  const config = loadConfig({ uipBin: opts.uipBin });
  const res: SpawnSyncReturns<string> = spawnSync(config.uipBin, [...args], {
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
  };
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
  return {
    agent,
    success: runs.every((r) => r.exitCode === 0),
    output: runs.map(formatRun).join('\n\n'),
    artifacts,
    durationMs: Date.now() - startMs,
    exitCodes: runs.map((r) => r.exitCode),
  };
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
