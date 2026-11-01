/**
 * Rollback — record pre-deploy process versions and restore them.
 *
 * Before each deploy, fetch all process keys + active versions via
 * `uip or processes list --all-folders --output json` and store the
 * snapshot. On rollback, read the last snapshot and restore each
 * process via `uip or processes rollback <key> --folder-path <p>`.
 *
 * Limitation: processes created by the deploy itself (new processes
 * added by the .uipx) are NOT rolled back — `uip or processes rollback`
 * only reverts existing processes to their previous version. Newly
 * created processes remain after rollback and must be manually removed
 * if needed.
 *
 * Verified commands (uip v1.202.1):
 * - `uip or processes list --all-folders --output json` — list all processes
 * - `uip or processes rollback <key> --folder-path <p> --output json` — rollback
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentContext, ProcessVersion, VersionSnapshot, RollbackResult } from '../types';
import { runUip } from '../config';
import chalk from 'chalk';

const VERSIONS_FILE = '.omu-versions.json';

/** Parse the `uip or processes list` JSON output into ProcessVersion[]. */
function parseProcessList(stdout: string): ProcessVersion[] {
  if (!stdout.trim()) return [];
  try {
    const data = JSON.parse(stdout);
    // The output shape is { Data: [...] } or { Result: ..., Data: [...] }
    const processes = data?.Data ?? data?.processes ?? data ?? [];
    if (!Array.isArray(processes)) return [];

    return processes.map((p: Record<string, unknown>) => ({
      key: String(p.Key ?? p.key ?? p.Id ?? p.id ?? ''),
      name: String(p.Name ?? p.name ?? ''),
      version: String(p.Version ?? p.version ?? ''),
    })).filter((p: ProcessVersion) => p.key);
  } catch {
    return [];
  }
}

/** Record the pre-deploy version snapshot. */
export function recordPreDeployVersions(ctx: AgentContext, env: string): VersionSnapshot {
  const result = runUip(ctx, ['or', 'processes', 'list', '--all-folders', '--output', 'json'], {
    label: 'rollback: record pre-deploy versions',
  });

  const processes = parseProcessList(result.stdout);
  const snapshot: VersionSnapshot = {
    timestamp: Date.now(),
    env,
    tenant: ctx.tenant ?? 'default',
    folder: ctx.folder ?? 'Shared',
    processes,
  };

  // Store in .omu-versions.json (append to array).
  const versionsPath = path.join(ctx.cwd, VERSIONS_FILE);
  let snapshots: VersionSnapshot[] = [];
  if (fs.existsSync(versionsPath)) {
    try {
      snapshots = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));
    } catch {
      snapshots = [];
    }
  }
  snapshots.push(snapshot);
  fs.writeFileSync(versionsPath, JSON.stringify(snapshots, null, 2));

  return snapshot;
}

/** Load the last version snapshot for a given env. */
export function loadLastSnapshot(ctx: AgentContext, env: string): VersionSnapshot | undefined {
  const versionsPath = path.join(ctx.cwd, VERSIONS_FILE);
  if (!fs.existsSync(versionsPath)) return undefined;

  try {
    const snapshots = JSON.parse(fs.readFileSync(versionsPath, 'utf8')) as VersionSnapshot[];
    const filtered = snapshots.filter((s) => s.env === env);
    if (filtered.length === 0) return undefined;
    return filtered[filtered.length - 1];
  } catch {
    return undefined;
  }
}

/** Rollback to the last recorded version snapshot for the given env. */
export async function rollback(
  ctx: AgentContext,
  env: string,
): Promise<RollbackResult> {
  const snapshot = loadLastSnapshot(ctx, env);
  if (!snapshot) {
    return {
      success: false,
      env,
      rolledBack: [],
      output: `No version snapshot found for env "${env}". Run a deploy first.`,
    };
  }

  if (ctx.dryRun) {
    const lines = snapshot.processes.map((p) => `  ${p.name} (${p.key}) → v${p.version}`);
    return {
      success: true,
      env,
      rolledBack: snapshot.processes.map((p) => p.name),
      output: `[dry-run] Would rollback ${snapshot.processes.length} process(es) to:\n${lines.join('\n')}\nSnapshot from ${new Date(snapshot.timestamp).toISOString()}`,
    };
  }

  // Run rollback for each process.
  const rolledBack: string[] = [];
  let allSuccess = true;

  for (const proc of snapshot.processes) {
    const result = runUip(ctx, [
      'or', 'processes', 'rollback', proc.key,
      '--folder-path', snapshot.folder,
      '--output', 'json',
    ], { label: `rollback: ${proc.name}` });

    if (result.exitCode === 0) {
      rolledBack.push(proc.name);
    } else {
      allSuccess = false;
    }
  }

  return {
    success: allSuccess,
    env,
    rolledBack,
    output: allSuccess
      ? `Rolled back ${rolledBack.length} process(es) to pre-deploy versions`
      : `Rollback partially failed: ${rolledBack.length}/${snapshot.processes.length} succeeded`,
  };
}

/** Print a rollback result for the CLI. */
export function printRollback(r: RollbackResult): void {
  const tag = r.success ? chalk.green('OK') : chalk.red('FAIL');
  console.log(`\n${tag} ${chalk.bold(`Rollback (${r.env})`)}`);
  console.log(chalk.gray(`  ${r.output.split('\n')[0]}`));
  if (r.rolledBack.length > 0) {
    console.log(chalk.gray(`  Rolled back: ${r.rolledBack.join(', ')}`));
  }
}