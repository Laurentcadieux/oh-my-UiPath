/**
 * quality-gate — validates and tests before and after deploy.
 *
 * Owns: case-plan validation, RPA static analysis, and Test Manager execution.
 * Maps to `uip maestro case validate`, `uip rpa analyze`, `uip test run` and
 * the `uipath-test`, `uipath-maestro-case`, `uipath-review` skills.
 */
import type { Agent, AgentContext, AgentResult } from '../types';
import { runUip, makeResult, planResult } from '../config';

export const qualityGate: Agent = {
  name: 'quality-gate',
  role:
    'Validates and tests the solution: case-plan validation, RPA static analysis, and Test Manager execution.',
  skills: ['uipath-test', 'uipath-maestro-case', 'uipath-review'],
  commands: ['uip maestro case validate', 'uip rpa analyze', 'uip test run'],
  async run(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now();

    const plan = [
      'maestro case validate',
      'rpa analyze --json',
      'test run --json',
    ];

    if (ctx.dryRun) {
      return planResult('quality-gate', plan, ['quality-report.json'], start);
    }

    const validate = runUip(ctx, ['maestro', 'case', 'validate']);
    const analyze = runUip(ctx, ['rpa', 'analyze', '--json']);
    const test = runUip(ctx, ['test', 'run', '--json']);
    return makeResult(
      'quality-gate',
      [validate, analyze, test],
      ['quality-report.json'],
      start,
    );
  },
};
