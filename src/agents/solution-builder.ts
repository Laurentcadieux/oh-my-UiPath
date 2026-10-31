/**
 * solution-builder — builds UiPath solutions (`.uipx`).
 *
 * Owns: scaffolding a solution from the SDD-derived project list, restoring
 * dependencies, and packing into a deployable `.uipx`. Maps to
 * `uip solution init/restore/pack` and `uip rpa pack`.
 */
import * as path from 'node:path';
import type { Agent, AgentContext, AgentResult } from '../types';
import { runUip, makeResult, planResult } from '../config';
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
    'uip rpa pack',
  ],
  async run(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now();
    const name = defaultSolutionName(ctx.cwd);
    const outDir = 'dist';
    const uipxGlob = path.join(outDir, '*.uipx');

    const plan = [
      `solution init --name ${name}`,
      `solution restore`,
      `solution pack --output ${outDir}`,
    ];

    if (ctx.dryRun) {
      return planResult('solution-builder', plan, [uipxGlob], start);
    }

    const init = runUip(ctx, ['solution', 'init', '--name', name]);
    const restore = runUip(ctx, ['solution', 'restore']);
    const pack = runUip(ctx, ['solution', 'pack', '--output', outDir]);
    return makeResult('solution-builder', [init, restore, pack], [uipxGlob], start);
  },
};
