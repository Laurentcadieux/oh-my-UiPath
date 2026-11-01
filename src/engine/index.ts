/**
 * Engine entry — runPipeline(ctx, mode) orchestrates the DAG either
 * sequentially or in parallel.
 *
 * Sequential mode: run stages in topological order (same as current autopilot).
 * Parallel mode: run independent tasks in parallel with the worker pool,
 *   MUTATING tasks through the lock, fail-fast cancellation.
 */
import type { AgentContext, AgentResult } from '../types';
import { getAgent } from '../agents';
import {
  buildAutopilotDag,
  topologicalSort,
  formatDag,
  formatBatches,
} from './task-graph';
import { runParallel, formatResults } from './worker-pool';
import type { TaskResult } from './types';
import { fetchTenantSnapshot } from './tenant-snapshot';
import { loadSkillStatusMap, isSkillAllowed } from '../skill-status';
import chalk from 'chalk';

export type EngineMode = 'sequential' | 'parallel';

export interface EngineOptions {
  readonly concurrency?: number;
  readonly dryRun?: boolean;
}

export interface EngineReport {
  readonly results: AgentResult[];
  readonly taskResults?: TaskResult[];
  readonly dagString?: string;
  readonly batchString?: string;
  readonly taskResultString?: string;
}

/**
 * Run the full autopilot pipeline through the engine.
 */
export async function runPipeline(
  ctx: AgentContext,
  mode: EngineMode,
  opts: EngineOptions = {},
): Promise<EngineReport> {
  const dag = buildAutopilotDag(ctx);

  if (ctx.dryRun) {
    const dagStr = formatDag(dag);
    const batchStr = formatBatches(dag, opts.concurrency ?? 4);
    return {
      results: [],
      dagString: dagStr,
      batchString: batchStr,
    };
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

  if (mode === 'sequential') {
    // Run stages in topological order.
    const sorted = topologicalSort(dag);
    const results: AgentResult[] = [];
    for (const task of sorted) {
      const agent = getAgent(task.agent);
      if (!agent) continue;
      const res = await agent.run(ctx);
      results.push(res);
      if (!res.success) {
        // Run diagnostician on failure.
        const diag = getAgent('diagnostician');
        if (diag) {
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

  // Parallel mode.
  // 1. Fetch tenant snapshot in parallel.
  const snapshot = await fetchTenantSnapshot(ctx);
  void snapshot; // snapshot is available for workers via ctx in future versions

  // 2. Run tasks in parallel.
  const taskResults = await runParallel(dag, ctx, opts.concurrency ?? 4);

  // 3. Convert to AgentResult[] for compatibility.
  const results: AgentResult[] = taskResults.map((tr) => ({
    agent: tr.agent,
    success: tr.status === 'ok',
    output: tr.output,
    artifacts: [],
    durationMs: tr.durationMs,
    exitCodes: tr.exitCodes,
  }));

  return {
    results,
    taskResults,
    taskResultString: formatResults(taskResults),
  };
}