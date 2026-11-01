/**
 * Environments — dev → test → prod promotion with gates.
 *
 * Loads environment config from `.omu-env.json`, checks promotion gates
 * (validate passed, no blocking review findings, test pass rate), and
 * switches tenant via `uip login tenant set`.
 *
 * Verified commands (uip v1.202.1):
 * - `uip login tenant set <name>` — switch active tenant
 * - `uip login tenant list --output json` — list available tenants
 * - `uip or processes list --all-folders --output json` — get processes
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentContext, EnvironmentConfig, EnvTarget, PromotionResult } from '../types';
import { runUip } from '../config';
import chalk from 'chalk';

/** Default environment config. */
const DEFAULT_ENV_CONFIG: EnvironmentConfig = {
  dev: { tenant: 'Dev', folder: 'Shared', requireValidation: true, requireReview: true, minTestPassRate: 0.8, requireConfirmation: false },
  test: { tenant: 'Test', folder: 'Shared', requireValidation: true, requireReview: true, minTestPassRate: 0.9, requireConfirmation: false },
  prod: { tenant: 'Prod', folder: 'Shared', requireValidation: true, requireReview: true, minTestPassRate: 1.0, requireConfirmation: true },
};

/** Load environment config from `.omu-env.json` in cwd, or use defaults. */
export function loadEnvironments(ctx: AgentContext): EnvironmentConfig {
  const envPath = path.join(ctx.cwd, '.omu-env.json');
  if (!fs.existsSync(envPath)) return DEFAULT_ENV_CONFIG;

  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<EnvironmentConfig>;
    return {
      dev: { ...DEFAULT_ENV_CONFIG.dev, ...parsed.dev },
      test: { ...DEFAULT_ENV_CONFIG.test, ...parsed.test },
      prod: { ...DEFAULT_ENV_CONFIG.prod, ...parsed.prod },
    };
  } catch {
    return DEFAULT_ENV_CONFIG;
  }
}

/** Get an environment target by name. */
export function getEnvTarget(env: string, ctx: AgentContext): EnvTarget | undefined {
  const config = loadEnvironments(ctx);
  const map = config as unknown as Record<string, EnvTarget>;
  return map[env];
}

/** Check promotion gates for a target environment. */
export function checkGates(
  target: EnvTarget,
  opts: {
    validationPassed?: boolean;
    criticalFindings?: number;
    testPassRate?: number;
  },
): { passed: boolean; gates: readonly string[] } {
  const gates: string[] = [];

  // Gate 1: Validation passed.
  if (target.requireValidation) {
    if (opts.validationPassed === false) {
      gates.push('FAIL: validation did not pass');
    } else {
      gates.push('OK: validation passed');
    }
  }

  // Gate 2: No blocking review findings.
  if (target.requireReview) {
    if ((opts.criticalFindings ?? 0) > 0) {
      gates.push(`FAIL: ${opts.criticalFindings} Critical review finding(s)`);
    } else {
      gates.push('OK: no Critical review findings');
    }
  }

  // Gate 3: Test pass rate.
  const passRate = opts.testPassRate ?? 1.0;
  if (passRate < target.minTestPassRate) {
    gates.push(`FAIL: test pass rate ${(passRate * 100).toFixed(0)}% < ${(target.minTestPassRate * 100).toFixed(0)}%`);
  } else {
    gates.push(`OK: test pass rate ${(passRate * 100).toFixed(0)}% ≥ ${(target.minTestPassRate * 100).toFixed(0)}%`);
  }

  const passed = gates.every((g) => g.startsWith('OK'));
  return { passed, gates };
}

/** Promote from one environment to another. */
export async function promote(
  ctx: AgentContext,
  from: string,
  to: string,
  opts: {
    validationPassed?: boolean;
    criticalFindings?: number;
    testPassRate?: number;
    confirm?: boolean;
  } = {},
): Promise<PromotionResult> {
  const target = getEnvTarget(to, ctx);
  if (!target) {
    return {
      success: false,
      from,
      to,
      gatesPassed: false,
      gates: [`FAIL: unknown environment "${to}"`],
      output: `Unknown environment: ${to}`,
    };
  }

  // Check gates.
  const { passed, gates } = checkGates(target, opts);

  if (!passed) {
    return {
      success: false,
      from,
      to,
      gatesPassed: false,
      gates,
      output: `Promotion blocked — gates failed:\n${gates.map((g) => `  ${g}`).join('\n')}`,
    };
  }

  // Check confirmation for prod.
  if (target.requireConfirmation && !opts.confirm && !ctx.dryRun) {
    return {
      success: false,
      from,
      to,
      gatesPassed: true,
      gates,
      output: `Promotion to "${to}" requires --confirm`,
    };
  }

  if (ctx.dryRun) {
    return {
      success: true,
      from,
      to,
      gatesPassed: true,
      gates,
      output: `[dry-run] Would promote ${from} → ${to}\nGates:\n${gates.map((g) => `  ${g}`).join('\n')}\nWould run: uip login tenant set ${target.tenant}`,
    };
  }

  // Switch tenant.
  const switchResult = runUip(ctx, ['login', 'tenant', 'set', target.tenant], {
    label: `promote: tenant set ${target.tenant}`,
  });

  return {
    success: switchResult.exitCode === 0,
    from,
    to,
    gatesPassed: true,
    gates,
    output: `Promoted ${from} → ${to}\nGates:\n${gates.map((g) => `  ${g}`).join('\n')}\n${switchResult.stdout}${switchResult.stderr}`,
  };
}

/** Print a promotion result for the CLI. */
export function printPromotion(r: PromotionResult): void {
  const tag = r.success ? chalk.green('OK') : chalk.red('FAIL');
  console.log(`\n${tag} ${chalk.bold(`Promote ${r.from} → ${r.to}`)}`);
  console.log(chalk.gray(`  Gates: ${r.gatesPassed ? 'passed' : 'failed'}`));
  for (const g of r.gates) {
    const color = g.startsWith('OK') ? chalk.green : g.startsWith('FAIL') ? chalk.red : chalk.gray;
    console.log(color(`  ${g}`));
  }
  console.log(chalk.gray(`  ${r.output.split('\n')[0]}`));
}