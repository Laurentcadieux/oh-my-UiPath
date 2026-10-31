/**
 * Workflow registry. Add a new workflow here and export it.
 */
import type { Workflow } from '../types';
import { buildWorkflow } from './build';
import { deployWorkflow } from './deploy';
import { autopilotWorkflow } from './autopilot';

export { buildWorkflow } from './build';
export { deployWorkflow } from './deploy';
export { autopilotWorkflow } from './autopilot';

/** Ordered list of all workflows. */
export const workflowList: readonly Workflow[] = [
  autopilotWorkflow,
  buildWorkflow,
  deployWorkflow,
];

/** Name -> workflow lookup. */
export const workflows: Record<string, Workflow> = Object.fromEntries(
  workflowList.map((w) => [w.name, w]),
);

/** Get a workflow by name, or undefined. */
export function getWorkflow(name: string): Workflow | undefined {
  return workflows[name];
}
