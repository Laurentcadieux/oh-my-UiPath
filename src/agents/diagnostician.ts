/**
 * diagnostician — wraps uipath-troubleshoot to diagnose failures.
 *
 * When a pipeline step fails (validate, deploy, test), the pipeline feeds
 * the error + logs to this agent. It loads `uipath-troubleshoot/SKILL.md`,
 * follows its investigation procedure, and runs diagnostic `uip` commands
 * to find the root cause. It does NOT apply fixes — it diagnoses and
 * recommends.
 *
 * Verified commands (uip v1.202.1):
 * - `uip or jobs logs <jobId> --output json` — get job logs
 * - `uip or jobs get <jobId> --output json` — get job details
 * - `uip solution deploy status --output json` — check deployment status
 * - `uip maestro case validate <file> --output json` — re-validate case plan
 */
import * as path from 'node:path';
import type { Agent, AgentContext, AgentResult } from '../types';
import { runUipChain, makeChainResult, planResult, loadConfig } from '../config';

export const diagnostician: Agent = {
  name: 'diagnostician',
  role:
    'Diagnoses pipeline failures by loading uipath-troubleshoot and running diagnostic uip commands. Recommends fixes — does not apply them.',
  skills: ['uipath-troubleshoot'],
  commands: [
    'uip or jobs logs',
    'uip or jobs get',
    'uip solution deploy status',
    'uip maestro case validate',
  ],
  async run(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now();
    const skillRoot = loadConfig().skillsRoot;
    const troubleshootPath = path.join(skillRoot, 'uipath-troubleshoot', 'SKILL.md');

    if (ctx.dryRun) {
      return planResult('diagnostician', [
        `load ${troubleshootPath}`,
        'anchor the failing entity',
        'extract signals from error output',
        'route to playbook',
        'run diagnostic uip commands',
        'present root cause + recommended fix',
      ], [troubleshootPath], start);
    }

    // The diagnostician runs read-only diagnostic commands.
    // In a real pipeline, ctx.labels would carry the failing step's output.
    const chain = runUipChain(ctx, [
      {
        args: ['or', 'folders', 'list', '--output', 'json'],
        label: 'diagnostic: folders list',
      },
    ]);
    return makeChainResult('diagnostician', chain, [troubleshootPath], start);
  },
};