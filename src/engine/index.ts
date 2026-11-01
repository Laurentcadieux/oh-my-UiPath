/**
 * Engine entry — runPipeline(ctx) orchestrates the DAG sequentially.
 *
 * The autopilot graph is strictly linear (plan → review → deploy → test),
 * so there are no independent branches to parallelize. The parallel engine
 * and bench command have been removed until the graph has independent
 * branches with a measured gain.
 */
import type { AgentContext, AgentResult } from '../types';
import { getAgent } from '../agents';
import {
  buildAutopilotDag,
  topologicalSort,
} from './task-graph';
import { loadSkillStatusMap, isSkillAllowed } from '../skill-status';
import { attemptRecovery } from './recovery';
import chalk from 'chalk';

export interface EngineOptions {
  readonly dryRun?: boolean;
}

export interface EngineReport {
  readonly results: AgentResult[];
}

/**
 * Run the full autopilot pipeline through the engine (sequential only).
 */
export async function runPipeline(
  ctx: AgentContext,
): Promise<EngineReport> {
  const dag = buildAutopilotDag(ctx);

  if (ctx.dryRun) {
    return { results: [] };
  }

  // Status gating: check all skills before running.
  const statusMap = ctx.skillStatusMap ?? loadSkillStatusMap();
  for (const task of dag) {
    const check = isSkillAllowed(task.skill, ctx.tenant, ctx.allowPreview, statusMap);
    if (!check.allowed) {
      return {
        results: [{
          agent: 'engine',
          success: false,
          output: `Blocked: ${check.reason}`,
          artifacts: [],
          durationMs: 0,
        }],
      };
    }
    if (check.reason?.startsWith('Warning')) {
      console.log(chalk.yellow(`⚠ ${check.reason}`));
    }
  }

  // Run stages in topological order (sequential only).
  const sorted = topologicalSort(dag);
  const results: AgentResult[] = [];
  for (const task of sorted) {
    const agent = getAgent(task.agent);
    if (!agent) continue;
    let res = await agent.run(ctx);
    results.push(res);

    // Self-healing: if the step fails, attempt recovery (recommend-only).
    if (!res.success) {
      const recovery = await attemptRecovery(ctx, task.id, res.output, 0);

      // Recovery is recommend-only — never auto-applies.
      // Print the recommendation and stop the pipeline.
      if (recovery.fixType !== 'NONE') {
        console.log(chalk.yellow(`\n⚠ Recovery recommendation for "${task.id}":`));
        console.log(chalk.gray(recovery.output));
      }

      // Run diagnostician for detailed diagnosis.
      const diag = getAgent('diagnostician');
      if (diag && !ctx.dryRun) {
        const diagRes = await diag.run({
          ...ctx,
          labels: {
            ...(ctx.labels ?? {}),
            ['failed-step']: task.id,
            ['failed-output']: res.output.slice(0, 4096),
          },
        });
        results.push(diagRes);
      }
      break;
    }
  }
  return { results };
}