/**
 * diagnostician — wraps uipath-troubleshoot to diagnose failures.
 *
 * When a pipeline step fails, the pipeline feeds the error + logs to this
 * agent via ctx.labels['failed-output'] and ctx.labels['failed-step'].
 * The diagnostician uses that output to run targeted diagnostic uip commands:
 *
 * - If the failure output contains a job ID: `uip or jobs logs <jobId>`
 * - If the failure was a deploy step: `uip solution deploy status`
 * - Otherwise: `uip or folders list` (tenant context check)
 *
 * It does NOT apply fixes — it diagnoses and recommends.
 *
 * Verified commands (uip v1.202.1):
 * - `uip or jobs logs <jobId> --output json` — get job logs
 * - `uip or jobs get <jobId> --output json` — get job details
 * - `uip solution deploy status <id> --output json` — check deployment status
 * - `uip or folders list --output json` — list folders (context check)
 */
import * as path from 'node:path';
import type { Agent, AgentContext, AgentResult } from '../types';
import { runUip, runUipChain, makeResult, makeChainResult, planResult, loadConfig } from '../config';

/** Extract a job ID (GUID) from failure output. */
function extractJobId(output: string): string | undefined {
  // Match a GUID pattern: 8-4-4-4-12 hex digits
  const match = output.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match?.[0];
}

export const diagnostician: Agent = {
  name: 'diagnostician',
  role:
    'Diagnoses pipeline failures using the failure output. Runs targeted diagnostic uip commands based on the error. Recommends fixes — does not apply them.',
  skills: ['uipath-troubleshoot'],
  commands: [
    'uip or jobs logs',
    'uip or jobs get',
    'uip solution deploy status',
    'uip or folders list',
  ],
  async run(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now();
    const skillRoot = loadConfig().skillsRoot;
    const troubleshootPath = path.join(skillRoot, 'uipath-troubleshoot', 'SKILL.md');
    const failedOutput = ctx.labels?.['failed-output'] ?? '';
    const failedStep = ctx.labels?.['failed-step'] ?? 'unknown';

    if (ctx.dryRun) {
      return planResult('diagnostician', [
        `load ${troubleshootPath}`,
        `failed step: ${failedStep}`,
        `failure output: ${failedOutput.slice(0, 120)}...`,
        'extract job IDs from failure output',
        'run targeted diagnostic uip commands (jobs logs, deploy status)',
        'present root cause + recommended fix',
      ], [troubleshootPath], start);
    }

    // Use the failure output to run targeted diagnostics.
    const jobId = extractJobId(failedOutput);
    const isDeployFailure = failedStep.includes('deploy') || /deploy/i.test(failedOutput);
    const steps: { args: readonly string[]; label: string }[] = [];

    // If we found a job ID in the failure output, fetch its logs.
    if (jobId) {
      steps.push({
        args: ['or', 'jobs', 'logs', jobId, '--output', 'json'],
        label: `diagnostic: jobs logs ${jobId}`,
      });
      steps.push({
        args: ['or', 'jobs', 'get', jobId, '--output', 'json'],
        label: `diagnostic: jobs get ${jobId}`,
      });
    }

    // If the failure was a deploy step, check deployment status.
    if (isDeployFailure) {
      steps.push({
        args: ['solution', 'deploy', 'status', '--output', 'json'],
        label: 'diagnostic: deploy status',
      });
    }

    // Always do a folders list as a context sanity check.
    steps.push({
      args: ['or', 'folders', 'list', '--output', 'json'],
      label: 'diagnostic: folders list',
    });

    if (steps.length === 0) {
      return makeResult('diagnostician', runUip(ctx, ['or', 'folders', 'list', '--output', 'json'], {
        label: 'diagnostic: folders list',
      }), [troubleshootPath], start);
    }

    const chain = runUipChain(ctx, steps);
    return makeChainResult('diagnostician', chain, [troubleshootPath], start);
  },
};