/**
 * build workflow — pack + validate.
 * Chains solution-builder (pack) then quality-gate (validate).
 */
import type { AgentContext, AgentResult, Workflow } from '../types';
import { getAgent } from '../agents';

export const buildWorkflow: Workflow = {
  name: 'build',
  description: 'Pack the UiPath solution and validate it (pack -> validate).',
  steps: [
    { name: 'pack', agent: 'solution-builder', description: 'Init, restore, and pack .uipx' },
    { name: 'validate', agent: 'quality-gate', description: 'Case validate, RPA analyze, test run' },
  ],
  async run(ctx: AgentContext): Promise<AgentResult[]> {
    const results: AgentResult[] = [];
    const builder = getAgent('solution-builder');
    const gate = getAgent('quality-gate');
    if (builder) results.push(await builder.run(ctx));
    if (gate) results.push(await gate.run(ctx));
    return results;
  },
};
