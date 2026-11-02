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
import { isLocalTenant, isProdTenant, loadProdPattern } from './safety';

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
  /** Prod tenant pattern (regex string). */
  readonly prodTenantPattern?: string;
}

/** Load config, applying overrides and environment defaults. */
export function loadConfig(overrides: Partial<OhMyUiPathConfig> = {}): OhMyUiPathConfig {
  return {
    uipBin: overrides.uipBin ?? process.env.OMU_UIP_BIN ?? path.join(os.homedir(), '.npm-global', 'bin', 'uip'),
    skillsRoot: overrides.skillsRoot ?? process.env.OMU_SKILLS_ROOT ?? path.join(os.homedir(), '.agents', 'skills'),
    defaultTenant: overrides.defaultTenant ?? process.env.OMU_TENANT,
    defaultFolder: overrides.defaultFolder ?? process.env.OMU_FOLDER,
    prodTenantPattern: overrides.prodTenantPattern ?? loadProdPattern(),
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

/** MUTATING subcommands that change tenant state. Must match the hook. */
const MUTATING_PATTERNS = [
  /solution\s+publish\b/,
  /solution\s+deploy\s+run\b/,
  /solution\s+deploy\s+activate\b/,
  /solution\s+deploy\s+upgrade\b/,
  /solution\s+deploy\s+uninstall\b/,
  /solution\s+deploy\s+delete\b/,
  /solution\s+upload\b/,
  /solution\s+delete\b/,
  /solution\s+packages\s+delete\b/,
  /solution\s+feeds\s+delete\b/,
  /or\s+processes\s+rollback\b/,
  /or\s+processes\s+update-version\b/,
  /or\s+processes\s+(create|delete)\b/,
  /or\s+assets\s+(create|delete|update)\b/,
  /or\s+queues\s+(create|delete|share|unshare)\b/,
  /or\s+buckets\s+(create|delete)\b/,
  /or\s+folders\s+(create|delete)\b/,
  /or\s+libraries\s+(delete|upload)\b/,
  /or\s+jobs\s+(start|stop|restart)\b/,
  /or\s+queue-items\s+(start|stop|restart)\b/,
  /maestro\s+(case|bpmn|flow)\s+(publish|deploy|run)\b/,
  /codedapp\s+(publish|deploy|delete|push)\b/,
  /codedagent\s+(publish|deploy|register)\b/,
  /function\s+(publish|push)\b/,
  /ixp\s+projects\s+(publish|unpublish|delete)\b/,
  /is\s+connectors\s+(import|publish|delete)\b/,
  /agenthub\s+mcp\s+(create|delete|update)\b/,
  /admin\s+\S+\s+delete\b/,
  /ah\s+\S+\s+delete\b/,
];

/** Check if a uip command (args joined) is MUTATING. */
function isMutating(args: readonly string[]): boolean {
  const cmd = args.join(' ');
  return MUTATING_PATTERNS.some((re) => re.test(cmd));
}

/** Cached tenant lookup (30s TTL). */
let cachedTenant: { tenant: string; expiresAt: number } | null = null;

/** Get the real tenant name from `uip login status --output json`. */
function getRealTenant(ctx: AgentContext, bin: string): string {
  if (cachedTenant && Date.now() < cachedTenant.expiresAt) {
    return cachedTenant.tenant;
  }
  let cmd = bin;
  let cmdArgs = ['login', 'status', '--output', 'json'];
  if (bin.endsWith('.js')) {
    cmd = process.execPath;
    cmdArgs = [bin, 'login', 'status', '--output', 'json'];
  }
  try {
    const res = spawnSync(cmd, cmdArgs, {
      cwd: ctx.cwd,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    });
    const out = res.stdout ?? '';
    // Try to parse JSON — uip login status --output json returns { ... tenant: "..." ... }
    const match = out.match(/"tenant"\s*:\s*"([^"]+)"/i);
    const tenant = match ? match[1] : '';
    cachedTenant = { tenant, expiresAt: Date.now() + 30_000 };
    return tenant;
  } catch {
    return '';
  }
}

/**
 * Run the `uip` CLI synchronously with `args` in the context's cwd.
 *
 * Synchronous on purpose: each agent step is a small, bounded `uip` call and we
 * want deterministic ordering. Failures are returned (exitCode != 0), never
 * thrown — the caller decides how to aggregate.
 *
 * Prod guard: if the command is MUTATING, reads the real tenant from
 * `uip login status` and blocks on Prod. The `loco` tenant disables all rails.
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

  // ── Prod guard ──
  // If the command is MUTATING, check the real tenant and block on Prod.
  // The `loco` tenant disables all guard rails.
  if (!ctx.dryRun && isMutating(args)) {
    const realTenant = getRealTenant(ctx, bin);
    if (isLocalTenant(realTenant)) {
      // loco — all guard rails disabled
      process.stderr.write(
        `⚠ [omu-h] Guard rails disabled — tenant is "${realTenant}" (local).\n`,
      );
    } else if (process.env.OMU_ALLOW_PROD_MUTATIONS !== '1') {
      if (isProdTenant(realTenant, config.prodTenantPattern)) {
        return {
          command: config.uipBin,
          args,
          stdout: '',
          stderr: `✗ [omu-h] Blocked MUTATING uip command on Prod tenant "${realTenant}".\n  Set OMU_ALLOW_PROD_MUTATIONS=1 to bypass, or use omu-h rollback for safe reverts.`,
          exitCode: 1,
          label: opts.label,
        };
      }
      if (!realTenant || realTenant.length === 0) {
        return {
          command: config.uipBin,
          args,
          stdout: '',
          stderr: `✗ [omu-h] Blocked MUTATING uip command — tenant is unknown.\n  Run \`uip login\` first, or set OMU_ALLOW_PROD_MUTATIONS=1 to bypass.`,
          exitCode: 1,
          label: opts.label,
        };
      }
    }
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