/**
 * Task graph builder — converts the autopilot pipeline stages into a DAG.
 *
 * Each stage maps to a TaskNode with:
 * - mutation classification (READ_ONLY / AUTHORING / MUTATING)
 * - dependencies (which stages must complete first)
 * - the agent that runs it
 */
import type { TaskNode, TaskMutation } from './types';
import type { AgentContext } from '../types';

/** Build the autopilot DAG from the pipeline stages. */
export function buildAutopilotDag(ctx: AgentContext): TaskNode[] {
  const tenant = ctx.tenant ?? 'default';
  const folder = ctx.folder ?? 'Shared';

  // Stage definitions: id, name, agent, skill, commands, mutation, deps
  const stages: Array<{
    id: string;
    name: string;
    agent: string;
    skill: string;
    commands: string[];
    mutation: TaskMutation;
    deps: string[];
  }> = [
    {
      id: 'plan',
      name: 'Plan pipeline',
      agent: 'orchestrator',
      skill: 'uipath-planner',
      commands: ['uip or folders list', 'uip maestro case sdd parse'],
      mutation: 'READ_ONLY',
      deps: [],
    },
    {
      id: 'case',
      name: 'Design case plan',
      agent: 'case-architect',
      skill: 'uipath-maestro-case',
      commands: ['uip maestro case init', 'uip maestro case validate', 'uip maestro case pack'],
      mutation: 'AUTHORING',
      deps: ['plan'],
    },
    {
      id: 'build',
      name: 'Build solution',
      agent: 'solution-builder',
      skill: 'uipath-solution',
      commands: ['uip solution init', 'uip solution restore', 'uip solution pack'],
      mutation: 'AUTHORING',
      deps: ['case'],
    },
    {
      id: 'review',
      name: 'Review + validate',
      agent: 'reviewer',
      skill: 'uipath-review',
      commands: ['uip rpa validate', 'uip rpa build', 'uip maestro case validate'],
      mutation: 'READ_ONLY',
      deps: ['build'],
    },
    {
      id: 'deploy',
      name: 'Deploy solution',
      agent: 'deployment-manager',
      skill: 'uipath-solution',
      commands: ['uip solution upload', 'uip solution publish', 'uip solution deploy run', 'uip solution deploy activate'],
      mutation: 'MUTATING',
      deps: ['review'],
    },
    {
      id: 'test',
      name: 'Post-deploy tests',
      agent: 'quality-gate',
      skill: 'uipath-test',
      commands: ['uip maestro case validate'],
      mutation: 'READ_ONLY',
      deps: ['deploy'],
    },
  ];

  return stages.map((s) => ({
    ...s,
    uipCommands: s.commands,
    tenant,
    folder,
  }));
}

/** Get the topological order of tasks (for sequential execution). */
export function topologicalSort(tasks: readonly TaskNode[]): TaskNode[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const result: TaskNode[] = [];

  function visit(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);
    const task = byId.get(id);
    if (!task) return;
    for (const dep of task.deps) {
      visit(dep);
    }
    result.push(task);
  }

  for (const t of tasks) {
    visit(t.id);
  }
  return result;
}

/** Get all tasks that depend on `taskId` (transitively). */
export function getDependents(tasks: readonly TaskNode[], taskId: string): Set<string> {
  const result = new Set<string>();

  function collect(id: string): void {
    for (const t of tasks) {
      if (t.deps.includes(id) && !result.has(t.id)) {
        result.add(t.id);
        collect(t.id);
      }
    }
  }

  collect(taskId);
  return result;
}

/** Format the DAG as a printable string (for --dry-run). */
export function formatDag(tasks: readonly TaskNode[]): string {
  const lines: string[] = [];
  lines.push(`DAG (${tasks.length} tasks):`);
  for (const t of tasks) {
    const lockTag = t.mutation === 'MUTATING' ? `  lock: ${t.tenant}/${t.folder}` : '';
    const depStr = t.deps.length > 0 ? `[${t.deps.join(', ')}]` : '[]';
    lines.push(`  ${t.id.padEnd(8)} ${t.name.padEnd(20)} ${t.mutation.padEnd(12)} deps: ${depStr}${lockTag}`);
  }
  return lines.join('\n');
}

/** Format the parallel batches for --dry-run. */
export function formatBatches(tasks: readonly TaskNode[], concurrency: number): string {
  const lines: string[] = [];
  lines.push(`Parallel batches (concurrency=${concurrency}):`);

  // Simple batch visualization: group by dependency level
  const levels = new Map<number, TaskNode[]>();
  const byId = new Map(tasks.map((t) => [t.id, t]));

  function level(id: string): number {
    const t = byId.get(id);
    if (!t) return 0;
    if (t.deps.length === 0) return 0;
    return 1 + Math.max(...t.deps.map(level));
  }

  for (const t of tasks) {
    const lv = level(t.id);
    if (!levels.has(lv)) levels.set(lv, []);
    levels.get(lv)!.push(t);
  }

  const sorted = [...levels.entries()].sort((a, b) => a[0] - b[0]);
  let batchNum = 1;
  for (const [, batchTasks] of sorted) {
    const parts = batchTasks.map((t) => {
      const lockTag = t.mutation === 'MUTATING' ? '*' : '';
      return `${t.id}${lockTag}`;
    });
    lines.push(`  Batch ${batchNum}: [${parts.join(', ')}]${batchTasks.some((t) => t.mutation === 'MUTATING') ? '  (* = mutation lock acquired)' : ''}`);
    batchNum++;
  }

  // Mutation lock summary
  const mutating = tasks.filter((t) => t.mutation === 'MUTATING');
  if (mutating.length > 0) {
    lines.push(`\nMutation locks: ${mutating.map((t) => `${t.tenant}/${t.folder}`).join(', ')} (${mutating.length} task(s))`);
  }

  return lines.join('\n');
}