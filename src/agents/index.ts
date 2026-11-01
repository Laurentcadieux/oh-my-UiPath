/**
 * Agent registry. Add a new agent here and export it from this module.
 */
import type { Agent } from '../types';
import { orchestrator } from './orchestrator';
import { solutionBuilder } from './solution-builder';
import { caseArchitect } from './case-architect';
import { deploymentManager } from './deployment-manager';
import { qualityGate } from './quality-gate';
import { reviewer } from './reviewer';
import { diagnostician } from './diagnostician';

export { orchestrator } from './orchestrator';
export { solutionBuilder } from './solution-builder';
export { caseArchitect } from './case-architect';
export { deploymentManager } from './deployment-manager';
export { qualityGate } from './quality-gate';
export { reviewer } from './reviewer';
export { diagnostician } from './diagnostician';

/** Ordered list of all agents (orchestrator first). */
export const agentList: readonly Agent[] = [
  orchestrator,
  solutionBuilder,
  caseArchitect,
  reviewer,
  qualityGate,
  deploymentManager,
  diagnostician,
];

/** Name -> agent lookup. */
export const agents: Record<string, Agent> = Object.fromEntries(
  agentList.map((a) => [a.name, a]),
);

/** Get an agent by name, or undefined. */
export function getAgent(name: string): Agent | undefined {
  return agents[name];
}
