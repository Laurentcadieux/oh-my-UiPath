/**
 * orchestrator — the coordinator agent.
 *
 * Owns: tenant/folder discovery and pipeline planning. It resolves the target
 * Orchestrator folder and plans the pipeline: review -> deploy -> test.
 * It does NOT author artifacts — that is the user's job (or upstream skills).
 *
 * Verified commands (uip v1.202.1):
 * - `uip or folders list --output json` — list Orchestrator folders
 */
import type { Agent, AgentContext, AgentResult } from '../types';
import { runUip, makeResult, planResult, loadConfig } from '../config';

export const orchestrator: Agent = {
  name: 'orchestrator',
  role:
    'Coordinates the pipeline: resolves tenant/folder context and plans review -> deploy -> test. Does not author artifacts.',
  skills: ['uipath-platform'],
  commands: ['uip or folders list'],
  async run(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now();
    const tenant = ctx.tenant ?? loadConfig().defaultTenant ?? '<env>';
    const folder = ctx.folder ?? loadConfig().defaultFolder ?? '<env>';

    const plan = [
      `cwd=${ctx.cwd}`,
      `tenant=${tenant}`,
      `folder=${folder}`,
      'pipeline: plan -> review -> deploy -> test',
    ];

    if (ctx.dryRun) {
      return planResult('orchestrator', plan, ['orchestration-plan.json'], start);
    }

    // Resolve the target Orchestrator folder so downstream agents inherit it.
    const folders = runUip(ctx, ['or', 'folders', 'list', '--output', 'json'], {
      label: 'folders list',
    });

    return makeResult('orchestrator', [folders], ['orchestration-plan.json'], start);
  },
};