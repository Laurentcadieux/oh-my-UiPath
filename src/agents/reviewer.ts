/**
 * reviewer — wraps uipath-review to validate and review before deploy.
 *
 * Runs after `build` and before `deploy`. Loads `uipath-review/SKILL.md`,
 * runs `uip rpa validate`, `uip rpa build`, and `uip maestro case validate`
 * as applicable. Gates the pipeline on Critical findings.
 *
 * Verified commands (uip v1.202.1):
 * - `uip rpa validate <file> --output json` — validate RPA entry point
 * - `uip rpa build <projectPath> --output json` — build/compile whole project
 * - `uip maestro case validate <file> --output json` — validate case plan
 *
 * NOTE: `uip rpa` commands require @uipath/rpa-tool which is not installed
 * in this environment (EACCES). The reviewer will attempt them and report
 * the failure — it does not fabricate validation results.
 */
import * as path from 'node:path';
import type { Agent, AgentContext, AgentResult } from '../types';
import { runUipChain, makeChainResult, planResult, loadConfig } from '../config';

export const reviewer: Agent = {
  name: 'reviewer',
  role:
    'Validates and reviews the solution before deploy. Runs uip rpa validate/build and maestro case validate. Gates on Critical findings.',
  skills: ['uipath-review'],
  commands: [
    'uip rpa validate',
    'uip rpa build',
    'uip maestro case validate',
  ],
  async run(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now();
    const skillRoot = loadConfig().skillsRoot;
    const reviewSkillPath = path.join(skillRoot, 'uipath-review', 'SKILL.md');
    const caseplanPath = path.join(ctx.cwd, 'caseplan.json');
    const projectPath = ctx.solutionPath ?? ctx.cwd;

    if (ctx.dryRun) {
      return planResult('reviewer', [
        `load ${reviewSkillPath}`,
        `rpa validate ${projectPath}`,
        `rpa build ${projectPath}`,
        `maestro case validate ${caseplanPath}`,
        'classify findings: Critical / Warning / Info',
        'gate: stop on Critical, warn on Warning, pass on Info',
      ], [reviewSkillPath], start);
    }

    // Run validation commands. These are read-only diagnostics.
    // rpa validate/build require @uipath/rpa-tool — may fail with EACCES.
    // We still run them and report the actual exit codes.
    const chain = runUipChain(ctx, [
      {
        args: ['rpa', 'validate', projectPath, '--output', 'json'],
        label: 'rpa validate',
      },
      {
        args: ['rpa', 'build', projectPath, '--output', 'json'],
        label: 'rpa build',
      },
      {
        args: ['maestro', 'case', 'validate', caseplanPath, '--output', 'json'],
        label: 'case validate (review)',
      },
    ]);
    return makeChainResult('reviewer', chain, [reviewSkillPath], start);
  },
};