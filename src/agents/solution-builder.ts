/**
 * solution-builder — builds UiPath solutions (`.uipx`).
 *
 * Owns: scaffolding a solution from the SDD-derived project list, restoring
 * dependencies, and packing into a deployable `.uipx`. Maps to
 * `uip solution init/restore/pack` and the `uipath-solution` skill.
 *
 * Verified against `uip solution --help` (v1.202.1):
 * - `uip solution init <solutionName>` — positional, not --name
 * - `uip solution restore <solutionPath>` — positional required
 * - `uip solution pack <solutionPath> <output-path>` — two positionals
 */
import * as path from 'node:path';
import type { Agent, AgentContext, AgentResult } from '../types';
import { runUipChain, makeChainResult, planResult } from '../config';
import { defaultSolutionName } from './orchestrator';

export const solutionBuilder: Agent = {
  name: 'solution-builder',
  role:
    'Scaffolds and packs UiPath solutions from an SDD-derived project list; produces a deployable .uipx.',
  skills: ['uipath-solution', 'uipath-rpa'],
  commands: [
    'uip solution init',
    'uip solution restore',
    'uip solution pack',
  ],
  async run(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now();
    const name = defaultSolutionName(ctx.cwd);
    const outDir = 'dist';
    const uipxGlob = path.join(outDir, '*.uipx');

    if (ctx.dryRun) {
      return planResult('solution-builder', [
        `solution init ${name}`,
        `solution restore ${name}`,
        `solution pack ${name} ${outDir}`,
      ], [uipxGlob], start);
    }

    const chain = runUipChain(ctx, [
      { args: ['solution', 'init', name], label: 'solution init' },
      { args: ['solution', 'restore', name], label: 'solution restore' },
      { args: ['solution', 'pack', name, outDir], label: 'solution pack' },
    ]);
    return makeChainResult('solution-builder', chain, [uipxGlob], start);
  },
};