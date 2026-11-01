/**
 * Recovery engine — recommend-only on pipeline failure.
 *
 * When a pipeline step fails, this module:
 * 1. Runs the diagnostician to diagnose the root cause
 * 2. Classifies the fix: AUTHORING (local files) or TENANT (tenant state)
 * 3. Recommends a fix command — NEVER auto-applies it
 *
 * The recommendation is printed for the user to run manually. This is a
 * deliberate safety decision: auto-applying fixes, even AUTHORING ones,
 * can mask the root cause and create unexpected state. The user should
 * review the diagnostician's output and the recommended command before
 * running it.
 */
import type { AgentContext, RecoveryResult } from '../types';
import { getAgent } from '../agents';
import chalk from 'chalk';

/** Classify a failure output as AUTHORING, TENANT, or NONE. */
export function classifyFailure(output: string): 'AUTHORING' | 'TENANT' | 'NONE' {
  const lower = output.toLowerCase();

  // TENANT errors take priority (more dangerous, need confirmation).
  const TENANT_KEYWORDS = [
    'version already exists',
    'name+version collision',
    'processkey collision',
    'permission denied',
    'access denied',
    'auth',
    'token expired',
    'feed rejected',
  ];
  for (const kw of TENANT_KEYWORDS) {
    if (lower.includes(kw)) return 'TENANT';
  }

  // AUTHORING errors (local file issues).
  const AUTHORING_KEYWORDS = [
    'stale binding',
    'resources refresh',
    'imported 0 bindings',
    'unimported',
    'unresolved resource',
    'pack failed',
    'build failed',
    'compile error',
  ];
  for (const kw of AUTHORING_KEYWORDS) {
    if (lower.includes(kw)) return 'AUTHORING';
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
    if (lower.includes('stale binding') || lower.includes('resources refresh') || lower.includes('imported 0 bindings')) {
      return ['solution', 'resources', 'refresh'];
    }
    if (lower.includes('pack failed') || lower.includes('build failed') || lower.includes('compile error')) {
      // These need a solution path — the user must provide it.
      return ['solution', 'pack', '<solutionPath>'];
    }
    return ['solution', 'resources', 'refresh'];
  }

  if (fixType === 'TENANT') {
    if (lower.includes('version already exists') || lower.includes('collision')) {
      return ['solution', 'publish', '<packagePath>', '--package-version', '<newVersion>'];
    }
    if (lower.includes('auth') || lower.includes('token expired')) {
      return ['login', 'refresh'];
    }
    if (lower.includes('feed rejected')) {
      return ['solution', 'feeds', 'list'];
    }
    return ['solution', 'deploy', 'run', '--parent-folder-path', '<folder>'];
  }

  return [];
}

/**
 * Attempt recovery from a failed pipeline step.
 *
 * Runs the diagnostician, classifies the fix, and RECOMMENDS it.
 * Never auto-applies — the user must run the recommended command manually.
 */
export async function attemptRecovery(
  ctx: AgentContext,
  failedStep: string,
  failureOutput: string,
  _retryCount: number = 0,
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
      retryCount: 0,
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
      output: `No fix classified for failure: ${failureOutput.slice(0, 200)}`,
      requiresConfirmation: false,
      fixType: 'NONE',
      retryCount: 0,
    };
  }

  // Recommend the fix — never auto-apply.
  const cmdStr = `uip ${fixCmd.join(' ')}`;
  return {
    applied: false,
    retried: false,
    output: `Recommended ${fixType} fix: ${cmdStr}\nReview the diagnostician output above, then run this command manually.`,
    requiresConfirmation: fixType === 'TENANT',
    fixType,
    retryCount: 0,
  };
}

/** Print a recovery result for the CLI. */
export function printRecovery(r: RecoveryResult): void {
  const tag = r.requiresConfirmation ? chalk.yellow('RECOMMEND (TENANT)') : r.fixType === 'AUTHORING' ? chalk.blue('RECOMMEND (AUTHORING)') : chalk.red('NO FIX');
  console.log(`\n${tag} ${chalk.bold('Recovery')}`);
  console.log(chalk.gray(`  ${r.output.split('\n')[0]}`));
}