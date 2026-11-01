/**
 * build workflow — review an existing `.uipx` (validate existing artifacts).
 *
 * With the artifact-authoring agents removed, "build" now means: validate the
 * already-built `.uipx`/solution the user points at. It does not author or
 * pack anything — that is the user's job (or upstream skills).
 */
import type { AgentContext, AgentResult, Workflow } from '../types';
import { getAgent } from '../agents';

export const buildWorkflow: Workflow = {
  name: 'build',
  description: 'Review an existing .uipx before deploy (validate existing artifacts).',
  steps: [
    { name: 'review', agent: 'reviewer', description: 'Validate the existing .uipx/solution before deploy' },
  ],
  async run(ctx: AgentContext): Promise<AgentResult[]> {
    const results: AgentResult[] = [];
    const reviewer = getAgent('reviewer');
    if (reviewer) results.push(await reviewer.run(ctx));
    return results;
  },
};