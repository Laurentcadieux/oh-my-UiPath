/**
 * orchestrator — the coordinator agent.
 *
 * Owns: tenant/folder discovery, pipeline planning, and routing to specialist
 * agents. Maps to `uip or` (orchestrator) and the platform skill.
 */
import * as path from 'node:path';
import type { Agent, AgentContext, AgentResult } from '../types';
import { runUip, makeResult, planResult, loadConfig } from '../config';

export const orchestrator: Agent = {
  name: 'orchestrator',
  role:
    'Coordinates the full SDD-to-deploy pipeline: resolves tenant/folder context, plans the agent sequence, and delegates to specialist agents.',
  skills: ['uipath-platform', 'uipath-solution', 'uipath-planner'],
  commands: ['uip or folders list'],
  async run(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now();
    const plan = [
      `cwd=${ctx.cwd}`,
      ctx.sddPath ? `sdd=${ctx.sddPath}` : 'sdd=<none>',
      `tenant=${ctx.tenant ?? loadConfig().defaultTenant ?? '<env>'}`,
      `folder=${ctx.folder ?? loadConfig().defaultFolder ?? '<env>'}`,
      'pipeline: plan -> build -> validate -> deploy -> test',
    ];

    if (ctx.dryRun) {
      return planResult('orchestrator', plan, ['orchestration-plan.json'], start);
    }

    // Resolve the target Orchestrator folder so downstream agents inherit it.
    // Verified: `uip or folders list --output json` (uip v1.202.1)
    const folders = runUip(ctx, ['or', 'folders', 'list', '--output', 'json'], {
      label: 'folders list',
    });
    return makeResult('orchestrator', [folders], ['orchestration-plan.json'], start);
  },
};

/** Derive a default solution name from the cwd. */
export function defaultSolutionName(cwd: string): string {
  return path.basename(path.resolve(cwd)) || 'oh-my-uipath-solution';
}