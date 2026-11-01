/**
 * orchestrator — the coordinator agent.
 *
 * Owns: tenant/folder discovery, pipeline planning, and routing to specialist
 * agents. By default delegates to the upstream uipath-planner skill to derive
 * the task list from an SDD. Falls back to omu-h's own planning with
 * --no-upstream-planner.
 *
 * Verified commands (uip v1.202.1):
 * - `uip or folders list --output json` — list Orchestrator folders
 * - `uip maestro case sdd parse <file> --output json` — parse an SDD file
 * - `uip maestro case sdd resolve <file> --output json` — resolve SDD refs
 */
import * as path from 'node:path';
import type { Agent, AgentContext, AgentResult } from '../types';
import { runUip, runUipChain, makeChainResult, makeResult, planResult, loadConfig } from '../config';

export const orchestrator: Agent = {
  name: 'orchestrator',
  role:
    'Coordinates the full SDD-to-deploy pipeline: resolves tenant/folder context, delegates to upstream uipath-planner for task derivation, and routes to specialist agents.',
  skills: ['uipath-platform', 'uipath-solution', 'uipath-planner'],
  commands: ['uip or folders list', 'uip maestro case sdd parse', 'uip maestro case sdd resolve'],
  async run(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now();
    const useUpstream = ctx.labels?.['use-upstream-planner'] !== 'false';
    const sdd = ctx.sddPath;

    const plan = [
      `cwd=${ctx.cwd}`,
      sdd ? `sdd=${sdd}` : 'sdd=<none>',
      `tenant=${ctx.tenant ?? loadConfig().defaultTenant ?? '<env>'}`,
      `folder=${ctx.folder ?? loadConfig().defaultFolder ?? '<env>'}`,
      `upstream-planner=${useUpstream}`,
      'pipeline: plan -> build -> review -> deploy -> test',
    ];

    if (ctx.dryRun) {
      return planResult('orchestrator', plan, ['orchestration-plan.json'], start);
    }

    // Resolve the target Orchestrator folder so downstream agents inherit it.
    const folders = runUip(ctx, ['or', 'folders', 'list', '--output', 'json'], {
      label: 'folders list',
    });

    // If we have an SDD and upstream planner is enabled, parse + resolve it.
    if (sdd && useUpstream) {
      const chain = runUipChain(ctx, [
        { args: ['or', 'folders', 'list', '--output', 'json'], label: 'folders list' },
        { args: ['maestro', 'case', 'sdd', 'parse', sdd, '--output', 'json'], label: 'sdd parse' },
        { args: ['maestro', 'case', 'sdd', 'resolve', sdd, '--output', 'json'], label: 'sdd resolve' },
      ]);
      return makeChainResult('orchestrator', chain, ['orchestration-plan.json'], start);
    }

    return makeResult('orchestrator', [folders], ['orchestration-plan.json'], start);
  },
};

/** Derive a default solution name from the cwd. */
export function defaultSolutionName(cwd: string): string {
  return path.basename(path.resolve(cwd)) || 'oh-my-uipath-solution';
}