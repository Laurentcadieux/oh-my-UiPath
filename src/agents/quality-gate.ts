/**
 * quality-gate — validates and tests before and after deploy.
 *
 * Owns: case-plan validation and Test Manager execution.
 * Maps to `uip maestro case validate` and the `uipath-test` +
 * `uipath-review` skills.
 *
 * Verified against `uip --help` (v1.202.1):
 * - `uip maestro case validate <file>` — positional required, verified ✅
 * - `uip rpa analyze` — requires @uipath/rpa-tool which is NOT installed
 *   (EACCES). Marked as UNVERIFIED. Not called until the tool is installed.
 * - `uip test` — does NOT exist as a top-level command. Marked as UNVERIFIED.
 *   Test execution uses `uip or` subcommands (e.g. `uip or jobs run`).
 */
import * as path from 'node:path';
import type { Agent, AgentContext, AgentResult } from '../types';
import { runUipChain, makeChainResult, planResult } from '../config';

export const qualityGate: Agent = {
  name: 'quality-gate',
  role:
    'Validates and tests the solution: case-plan validation and Test Manager execution.',
  skills: ['uipath-test', 'uipath-maestro-case', 'uipath-review'],
  commands: ['uip maestro case validate'],
  // NOTE: `uip rpa analyze` and `uip test run` are NOT verified — see header.
  // They require tools not installed in the current environment.
  async run(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now();
    const caseplanPath = path.join(ctx.cwd, 'caseplan.json');

    if (ctx.dryRun) {
      return planResult('quality-gate', [
        `maestro case validate ${caseplanPath}`,
        '# NOTE: rpa analyze and test run are UNVERIFIED (tool not installed)',
      ], ['quality-report.json'], start);
    }

    // Only run the verified command (case validate).
    // rpa analyze + test run are deliberately omitted — they need
    // @uipath/rpa-tool (not installed) and `uip test` (doesn't exist).
    const chain = runUipChain(ctx, [
      { args: ['maestro', 'case', 'validate', caseplanPath], label: 'case validate' },
    ]);
    return makeChainResult('quality-gate', chain, ['quality-report.json'], start);
  },
};