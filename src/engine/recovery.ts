/**
 * Recovery engine — self-healing on pipeline failure.
 *
 * When a pipeline step fails, this module:
 * 1. Runs the diagnostician to diagnose the root cause
 * 2. Classifies the fix: AUTHORING (local files, auto-applicable) or
 *    TENANT (changes tenant state, requires user confirmation)
 * 3. For AUTHORING fixes: applies the fix and retries the failed step
 *    (max 2 retries)
 * 4. For TENANT fixes: prints the recommended uip command and requires
 *    --confirm from the user
 */
import type { AgentContext, RecoveryResult } from '../types';
import { getAgent } from '../agents';
import { runUip } from '../config';
import chalk from 'chalk';

/** Max retries per failed step. */
const MAX_RETRIES = 2;

/** Error keywords that indicate an AUTHORING (local file) fix. */
const AUTHORING_ERRORS: readonly string[] = [
  'pack',
  'restore',
  'build',
  'compile',
  'binding',
  'stale',
  'missing file',
  'not found',
  'import',
  'resource',
  'refresh',
];

/** Error keywords that indicate a TENANT (state-changing) fix. */
const TENANT_ERRORS: readonly string[] = [
  'publish',
  'deploy',
  'activate',
  'version already exists',
  'collision',
  'duplicate',
  'permission denied',
  'access denied',
  'auth',
  'token',
  'expired',
  'folder',
  'feed',
];

/** Classify a failure output as AUTHORING or TENANT fix. */
export function classifyFailure(output: string): 'AUTHORING' | 'TENANT' | 'NONE' {
  const lower = output.toLowerCase();

  // Check TENANT errors first — they take priority (more dangerous).
  for (const keyword of TENANT_ERRORS) {
    if (lower.includes(keyword)) return 'TENANT';
  }

  // Then check AUTHORING errors.
  for (const keyword of AUTHORING_ERRORS) {
    if (lower.includes(keyword)) return 'AUTHORING';
  }

  return 'NONE';
}

/** Recommend a fix command based on the fix type and failure output. */
export function recommendFix(
  fixType: 'AUTHORING' | 'TENANT' | 'NONE',
  failureOutput: string,
): string[] {
  const lower = failureOutput.toLowerCase();

  if (fixType === 'AUTHORING') {
    if (lower.includes('stale') || lower.includes('binding') || lower.includes('refresh')) {
      return ['solution', 'resources', 'refresh'];
    }
    if (lower.includes('pack') || lower.includes('build') || lower.includes('compile')) {
      return ['solution', 'pack'];
    }
    if (lower.includes('restore') || lower.includes('missing')) {
      return ['solution', 'restore'];
    }
    return ['solution', 'pack']; // default authoring fix
  }

  if (fixType === 'TENANT') {
    if (lower.includes('version already exists') || lower.includes('collision')) {
      return ['solution', 'publish', '--package-version', 'next'];
    }
    if (lower.includes('auth') || lower.includes('token') || lower.includes('expired')) {
      return ['login', 'refresh'];
    }
    if (lower.includes('folder') || lower.includes('feed')) {
      return ['solution', 'deploy', 'run', '--parent-folder-path', 'Shared'];
    }
    return ['solution', 'deploy', 'run']; // default tenant fix
  }

  return [];
}

/**
 * Attempt recovery from a failed pipeline step.
 *
 * Runs the diagnostician, classifies the fix, applies if AUTHORING
 * (max 2 retries), or returns a recommendation if TENANT.
 */
export async function attemptRecovery(
  ctx: AgentContext,
  failedStep: string,
  failureOutput: string,
  retryCount: number = 0,
): Promise<RecoveryResult> {
  // Run the diagnostician first.
  const diagAgent = getAgent('diagnostician');
  if (!diagAgent) {
    return {
      applied: false,
      retried: false,
      output: 'diagnostician agent not found',
      requiresConfirmation: false,
      fixType: 'NONE',
      retryCount,
    };
  }

  const diagCtx: AgentContext = {
    ...ctx,
    labels: {
      ...(ctx.labels ?? {}),
      ['failed-step']: failedStep,
      ['failed-output']: failureOutput.slice(0, 4096),
    },
  };

  if (!ctx.dryRun) {
    await diagAgent.run(diagCtx);
  }

  // Classify the failure.
  const fixType = classifyFailure(failureOutput);
  const fixCmd = recommendFix(fixType, failureOutput);

  if (fixType === 'NONE' || fixCmd.length === 0) {
    return {
      applied: false,
      retried: false,
      output: `No auto-fix available for failure: ${failureOutput.slice(0, 200)}`,
      requiresConfirmation: false,
      fixType: 'NONE',
      retryCount,
    };
  }

  if (fixType === 'TENANT') {
    // TENANT fixes require user confirmation — don't auto-apply.
    const cmdStr = `uip ${fixCmd.join(' ')}`;
    return {
      applied: false,
      retried: false,
      output: `TENANT fix required: ${cmdStr}\nRun with --confirm to apply.`,
      requiresConfirmation: true,
      fixType: 'TENANT',
      retryCount,
    };
  }

  // AUTHORING fix — apply automatically if under retry limit.
  if (retryCount >= MAX_RETRIES) {
    return {
      applied: false,
      retried: false,
      output: `Max retries (${MAX_RETRIES}) reached for step "${failedStep}"`,
      requiresConfirmation: false,
      fixType: 'AUTHORING',
      retryCount,
    };
  }

  if (ctx.dryRun) {
    return {
      applied: true,
      retried: true,
      output: `[dry-run] Would apply AUTHORING fix: uip ${fixCmd.join(' ')}\nWould retry step "${failedStep}" (retry ${retryCount + 1}/${MAX_RETRIES})`,
      requiresConfirmation: false,
      fixType: 'AUTHORING',
      retryCount: retryCount + 1,
    };
  }

  // Apply the AUTHORING fix.
  const fixResult = runUip(ctx, fixCmd, { label: `recovery fix: ${fixCmd.join(' ')}` });
  const applied = fixResult.exitCode === 0;

  return {
    applied,
    retried: applied,
    output: `Applied AUTHORING fix: uip ${fixCmd.join(' ')} (exit ${fixResult.exitCode})\n${fixResult.stdout}${fixResult.stderr}`,
    requiresConfirmation: false,
    fixType: 'AUTHORING',
    retryCount: retryCount + 1,
  };
}

/** Print a recovery result for the CLI. */
export function printRecovery(r: RecoveryResult): void {
  const tag = r.applied ? chalk.green('RECOVERED') : r.requiresConfirmation ? chalk.yellow('NEEDS CONFIRM') : chalk.red('NO FIX');
  console.log(`\n${tag} ${chalk.bold('Recovery')} (retry ${r.retryCount})`);
  console.log(chalk.gray(`  ${r.output.split('\n')[0]}`));
}