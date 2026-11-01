/**
 * Worker pool — runs tasks in parallel with a semaphore, fail-fast cancellation.
 *
 * - Configurable concurrency (default 4).
 * - If a task fails, all tasks that transitively depend on it are cancelled.
 * - Unrelated branches (no dependency edge to the failed task) keep running.
 */
import type { TaskNode, TaskStatus, TaskResult } from './types';
import type { AgentContext, AgentResult } from '../types';
import { getAgent } from '../agents';
import { getDependents } from './task-graph';
import { acquireLock, lockKey, resetLocks } from './mutation-lock';

/** Run a single task via its agent. */
async function runTask(
  task: TaskNode,
  ctx: AgentContext,
): Promise<TaskResult> {
  const start = Date.now();
  const agent = getAgent(task.agent);

  if (!agent) {
    return {
      taskId: task.id,
      agent: task.agent,
      status: 'failed',
      durationMs: Date.now() - start,
      output: `agent "${task.agent}" not found`,
      exitCodes: [],
    };
  }

  // MUTATING tasks acquire the lock before running.
  let token: { release: () => void } | undefined;
  if (task.mutation === 'MUTATING') {
    const key = lockKey(task.tenant, task.folder);
    token = await acquireLock(key);
  }

  try {
    const res: AgentResult = await agent.run(ctx);
    return {
      taskId: task.id,
      agent: task.agent,
      status: res.success ? 'ok' : 'failed',
      durationMs: res.durationMs,
      output: res.output,
      exitCodes: res.exitCodes ?? [],
    };
  } catch (err: unknown) {
    return {
      taskId: task.id,
      agent: task.agent,
      status: 'failed',
      durationMs: Date.now() - start,
      output: String(err),
      exitCodes: [],
    };
  } finally {
    token?.release();
  }
}

/**
 * Run all tasks in parallel with the given concurrency.
 *
 * Fail-fast: if a task fails, cancel all tasks that transitively depend on it.
 * Unrelated branches keep running.
 */
export async function runParallel(
  tasks: readonly TaskNode[],
  ctx: AgentContext,
  concurrency: number = 4,
): Promise<TaskResult[]> {
  resetLocks();

  const results = new Map<string, TaskResult>();
  const completed = new Set<string>();  // includes both ok and failed
  const cancelled = new Set<string>();
  const running = new Set<string>();

  /** Check if all deps of a task are completed. */
  function depsReady(task: TaskNode): boolean {
    return task.deps.every((d) => completed.has(d) && !cancelled.has(d));
  }

  /** Check if any dep of a task is in the failed or cancelled set. */
  function depFailed(task: TaskNode): boolean {
    return task.deps.some((d) => {
      const r = results.get(d);
      return (r && r.status === 'failed') || cancelled.has(d);
    });
  }

  /** Cancel a task tree: the given task + all its transitive dependents. */
  function cancelTree(taskId: string): void {
    if (cancelled.has(taskId)) return;
    cancelled.add(taskId);
    for (const dep of getDependents(tasks, taskId)) {
      cancelled.add(dep);
    }
  }

  /** Check if all tasks are done (completed or cancelled) and resolve. */
  function allDone(): boolean {
    return tasks.every((t) => completed.has(t.id) || cancelled.has(t.id));
  }

  /** Build the final results array. */
  function buildResults(): TaskResult[] {
    return tasks.map((t) => {
      const r = results.get(t.id);
      if (r) return r;
      return {
        taskId: t.id,
        agent: t.agent,
        status: 'cancelled' as TaskStatus,
        durationMs: 0,
        output: 'cancelled due to dependency failure',
        exitCodes: [],
      };
    });
  }

  return new Promise<TaskResult[]>((resolve) => {
    let scheduleDepth = 0;

    function scheduleNext(): void {
      // Prevent infinite recursion.
      scheduleDepth++;
      if (scheduleDepth > 100) return;

      let scheduled = false;
      for (const task of tasks) {
        if (completed.has(task.id) || running.has(task.id) || cancelled.has(task.id)) continue;

        // Cancel if any dep failed.
        if (depFailed(task)) {
          cancelTree(task.id);
          continue;
        }

        // Skip if deps aren't ready.
        if (!depsReady(task)) continue;

        // Respect concurrency limit.
        if (running.size >= concurrency) break;

        // Start the task.
        running.add(task.id);
        scheduled = true;

        runTask(task, ctx).then((result) => {
          running.delete(task.id);
          results.set(task.id, result);
          completed.add(task.id);

          if (result.status === 'failed') {
            cancelTree(task.id);
          }

          // Check if we're done or schedule more.
          if (allDone()) {
            resolve(buildResults());
          } else {
            scheduleNext();
          }
        });
      }

      // Handle cancelled tasks — they don't count toward running.
      // Check if everything is done.
      if (allDone()) {
        resolve(buildResults());
        return;
      }

      // If nothing is running and nothing was scheduled, but we have
      // pending tasks that can't be scheduled (waiting on deps that
      // were cancelled), cancel them.
      if (running.size === 0 && !scheduled) {
        for (const task of tasks) {
          if (!completed.has(task.id) && !cancelled.has(task.id)) {
            cancelTree(task.id);
          }
        }
        if (allDone()) {
          resolve(buildResults());
        }
      }

      scheduleDepth--;
    }

    scheduleNext();
  });
}

/** Format task results as a status table (for printing). */
export function formatResults(results: readonly TaskResult[]): string {
  const lines: string[] = [];
  lines.push('\nTask Results:');
  lines.push('┌─────────┬──────────────────┬──────────────┬──────────┬──────────┐');
  lines.push('│ Task ID │ Name             │ Mutation     │ Duration │ Status   │');
  lines.push('├─────────┼──────────────────┼──────────────┼──────────┼──────────┤');

  for (const r of results) {
    const status = r.status === 'ok' ? 'OK' :
      r.status === 'failed' ? 'FAIL' :
      r.status === 'cancelled' ? 'CANCELLED' : r.status;
    lines.push(
      `│ ${r.taskId.padEnd(7)} │ ${r.agent.padEnd(16)} │ ${String(r.durationMs).padEnd(12)} │ ${String(r.durationMs).padEnd(8)}ms │ ${status.padEnd(8)} │`,
    );
  }

  lines.push('└─────────┴──────────────────┴──────────────┴──────────┴──────────┘');
  return lines.join('\n');
}