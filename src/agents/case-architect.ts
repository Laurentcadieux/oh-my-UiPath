/**
 * case-architect — designs Maestro Case Management definitions from an SDD.
 *
 * Owns: turning an SDD into a `caseplan.json`, validating it, and packing it
 * for deployment. Maps to `uip maestro case init/validate/pack` and the
 * `uipath-maestro-case` + `uipath-planner` skills.
 *
 * Verified against `uip maestro case --help` (v1.202.1):
 * - `uip maestro case init <name>` — positional, no --from-sdd flag exists
 * - `uip maestro case validate <file>` — positional required
 * - `uip maestro case pack <project-path> <output-path>` — two positionals
 */
import * as path from 'node:path';
import type { Agent, AgentContext, AgentResult } from '../types';
import { runUipChain, makeChainResult, planResult } from '../config';

export const caseArchitect: Agent = {
  name: 'case-architect',
  role:
    'Designs a Maestro Case Management caseplan.json from an SDD, then validates and packs it.',
  skills: ['uipath-maestro-case', 'uipath-planner'],
  commands: [
    'uip maestro case init',
    'uip maestro case validate',
    'uip maestro case pack',
  ],
  async run(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now();
    const caseName = 'hermes-case';
    const caseDir = path.join(ctx.cwd, caseName);
    const caseplanPath = path.join(caseDir, 'caseplan.json');
    const outDir = 'dist';

    if (ctx.dryRun) {
      return planResult('case-architect', [
        `maestro case init ${caseName}`,
        `maestro case validate ${caseplanPath}`,
        `maestro case pack ${caseDir} ${outDir}`,
      ], [caseplanPath], start);
    }

    const chain = runUipChain(ctx, [
      { args: ['maestro', 'case', 'init', caseName], label: 'case init' },
      { args: ['maestro', 'case', 'validate', caseplanPath], label: 'case validate' },
      { args: ['maestro', 'case', 'pack', caseDir, outDir], label: 'case pack' },
    ]);
    return makeChainResult('case-architect', chain, [caseplanPath], start);
  },
};