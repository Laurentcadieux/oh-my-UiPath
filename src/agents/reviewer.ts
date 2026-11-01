/**
 * reviewer — validates and reviews the solution before deploy.
 *
 * Runs `uip rpa validate`, `uip rpa build`, and `uip maestro case validate`
 * as applicable, then parses each command's JSON stdout to classify findings
 * by severity. Gates the pipeline on Critical findings.
 *
 * Verified commands (uip v1.202.1):
 * - `uip maestro case validate <file> --output json` — positional file arg ✅
 *
 * UNVERIFIED commands (uip v1.202.1) — require @uipath/rpa-tool which is NOT
 * installed in this environment (EACCES). Marked UNVERIFIED. The reviewer still
 * runs them and reports the real result; it never fabricates validation output.
 * - `uip rpa validate <projectPath> --output json` — UNVERIFIED
 * - `uip rpa build <projectPath> --output json` — UNVERIFIED
 */
import * as path from 'node:path';
import type { Agent, AgentContext, AgentResult, ReviewFinding } from '../types';
import { runUipChain, planResult, loadConfig } from '../config';
import type { UipRunResult } from '../config';

/**
 * Classify one validator command's output into a severity.
 *
 * Rules (per the task spec):
 * - Non-zero exit code -> Critical (the validator itself failed).
 * - Result === 'Failure' | 'ValidationError' -> Critical.
 * - Non-zero Error count in Data -> Critical.
 * - Non-zero Warning count in Data -> Warning.
 * - Otherwise -> Info (pass).
 */
function classifyValidator(label: string, r: UipRunResult): ReviewFinding {
  if (r.exitCode !== 0) {
    return {
      severity: 'Critical',
      message: `${label} exited ${r.exitCode}: ${r.stderr || r.stdout || 'non-zero exit'}`,
      rule: label,
    };
  }

  // Try to parse the stdout envelope. uip --output json returns { Result, Data, ... }.
  let data: Record<string, unknown> | undefined;
  if (r.stdout.trim()) {
    try {
      const parsed: unknown = JSON.parse(r.stdout);
      if (parsed && typeof parsed === 'object') {
        data = parsed as Record<string, unknown>;
      }
    } catch {
      // Non-JSON stdout with a zero exit — treat as a pass (no findings to parse).
    }
  }

  if (data) {
    const result = String(data.Result ?? data.result ?? '');
    if (result === 'Failure' || result === 'ValidationError') {
      return { severity: 'Critical', message: `${label}: Result=${result}`, rule: label };
    }
    const errors = Number(data.Errors ?? data.ErrorCount ?? data.errors ?? 0);
    const warnings = Number(data.Warnings ?? data.WarningCount ?? data.warnings ?? 0);
    if (Number.isFinite(errors) && errors > 0) {
      return { severity: 'Critical', message: `${label}: ${errors} error(s)`, rule: label };
    }
    if (Number.isFinite(warnings) && warnings > 0) {
      return { severity: 'Warning', message: `${label}: ${warnings} warning(s)`, rule: label };
    }
  }

  return { severity: 'Info', message: `${label}: passed`, rule: label };
}

export const reviewer: Agent = {
  name: 'reviewer',
  role:
    'Validates and reviews the solution before deploy. Runs uip rpa validate/build and maestro case validate, parses their JSON output, and gates on Critical findings.',
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
    // caseplan path: prefer ctx.solutionPath, fall back to <cwd>/caseplan.json.
    const caseplanPath = ctx.solutionPath ?? path.join(ctx.cwd, 'caseplan.json');
    const projectPath = ctx.solutionPath ?? ctx.cwd;

    if (ctx.dryRun) {
      return planResult('reviewer', [
        `load ${reviewSkillPath}`,
        `rpa validate ${projectPath}`,
        `rpa build ${projectPath}`,
        `maestro case validate ${caseplanPath}`,
        'parse JSON output per command: Critical / Warning / Info',
        'gate: stop on Critical, warn on Warning, pass on Info',
      ], [reviewSkillPath], start);
    }

    // NOTE: `uip rpa validate/build` are UNVERIFIED here — they need
    // @uipath/rpa-tool (not installed, EACCES). We run them anyway and report
    // the actual exit code + parsed output; we never fabricate results.
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

    // Classify each completed command by its parsed JSON output.
    const findings: ReviewFinding[] = chain.results.map((r) =>
      classifyValidator(r.label ?? r.args.join(' '), r),
    );
    const criticals = findings.filter((f) => f.severity === 'Critical');
    const hasCritical = criticals.length > 0;
    // A non-zero exit (chain stopped early) is itself a Critical signal.
    const chainFailed = chain.failedLabel !== undefined;
    const success = !hasCritical && !chainFailed;

    const findingsLine = findings
      .map((f) => `[${f.severity}] ${f.message}`)
      .join('\n');
    const output = success
      ? findingsLine
      : `${findingsLine}\n\n⚠ Review failed: ${criticals.length} Critical finding(s).`;

    return {
      agent: 'reviewer',
      success,
      output,
      artifacts: [reviewSkillPath],
      durationMs: Date.now() - start,
      exitCodes: chain.results.map((r) => r.exitCode),
    };
  },
};