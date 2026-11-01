/**
 * quality-gate — post-deploy verification.
 *
 * Owns: verifying that a deployment actually landed in the target folder.
 * Lists deployments in the folder and confirms at least one is in a
 * 'Successful' state. This is verification of a live deployment, NOT a
 * re-validation of the local caseplan.json (that is the reviewer's job).
 *
 * Verified against `uip solution deploy list --help` (v1.202.1):
 * - `uip solution deploy list --folder-path <path> --output json` ✅
 *   Filters by parent folder path; returns deployments with their operation
 *   status (Draft/Successful/Failed/InProgress/FailedRollback).
 */
import type { Agent, AgentContext, AgentResult } from '../types';
import { runUip, makeResult, planResult } from '../config';
import type { UipRunResult } from '../config';

/**
 * Parse `uip solution deploy list` JSON output and report whether any
 * deployment in the folder is in a 'Successful' state.
 */
function parseDeployList(
  stdout: string,
): { successful: boolean; count: number } {
  if (!stdout.trim()) return { successful: false, count: 0 };
  let data: unknown;
  try {
    data = JSON.parse(stdout);
  } catch {
    return { successful: false, count: 0 };
  }

  // uip --output json returns { Result, Data, ... }; deployments live in Data.
  const envelope = data as Record<string, unknown>;
  const list: unknown = envelope?.Data ?? envelope?.deployments ?? envelope ?? [];
  if (!Array.isArray(list)) return { successful: false, count: 0 };

  const count = list.length;
  const successful = list.some((dep) => {
    const d = dep as Record<string, unknown>;
    // Operation status is the field that flips to 'Successful' once the
    // deploy run finishes. Check common field names, case-insensitively.
    const status = String(
      d.OperationStatus ?? d.Status ?? d.State ?? '',
    ).toLowerCase();
    return status === 'successful';
  });
  return { successful, count };
}

export const qualityGate: Agent = {
  name: 'quality-gate',
  role:
    'Post-deploy verification: lists deployments in the target folder and confirms at least one is Successful.',
  skills: ['uipath-solution', 'uipath-platform'],
  commands: ['uip solution deploy list'],
  async run(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now();
    const folder = ctx.folder ?? 'Shared';

    if (ctx.dryRun) {
      return planResult('quality-gate', [
        `solution deploy list --folder-path ${folder} --output json`,
        'check for at least one Successful deployment',
      ], ['quality-report.json'], start);
    }

    // Post-deploy verification: list deployments in the target folder.
    const res: UipRunResult = runUip(
      ctx,
      ['solution', 'deploy', 'list', '--folder-path', folder, '--output', 'json'],
      { label: 'deploy list' },
    );

    // If the list command itself failed, surface that.
    if (res.exitCode !== 0) {
      return makeResult('quality-gate', res, ['quality-report.json'], start);
    }

    const { successful, count } = parseDeployList(res.stdout);
    const output = successful
      ? `Post-deploy verification: ${count} deployment(s) in "${folder}", at least one Successful.`
      : `Post-deploy verification: ${count} deployment(s) in "${folder}", none Successful.`;

    return {
      agent: 'quality-gate',
      success: successful,
      output,
      artifacts: ['quality-report.json'],
      durationMs: Date.now() - start,
      exitCodes: [res.exitCode],
    };
  },
};