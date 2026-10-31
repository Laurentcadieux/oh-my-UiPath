/**
 * case-architect — designs Maestro Case Management definitions from an SDD.
 *
 * Owns: turning an SDD into a `caseplan.json`, validating it, and packing it
 * for deployment. Maps to `uip maestro case init/validate/pack` and the
 * `uipath-maestro-case` + `uipath-planner` skills.
 */
import type { Agent, AgentContext, AgentResult } from '../types';
import { runUip, makeResult, planResult } from '../config';

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
    const sdd = ctx.sddPath ?? 'sdd.md';

    const plan = [
      `maestro case init --from-sdd ${sdd}`,
      'maestro case validate',
      'maestro case pack',
    ];

    if (ctx.dryRun) {
      return planResult('case-architect', plan, ['caseplan.json'], start);
    }

    const init = runUip(ctx, ['maestro', 'case', 'init', '--from-sdd', sdd]);
    const validate = runUip(ctx, ['maestro', 'case', 'validate']);
    const pack = runUip(ctx, ['maestro', 'case', 'pack']);
    return makeResult('case-architect', [init, validate, pack], ['caseplan.json'], start);
  },
};
