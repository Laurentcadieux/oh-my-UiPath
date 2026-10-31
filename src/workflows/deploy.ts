/**
 * deploy workflow — upload -> publish -> deploy -> activate.
 * Chains deployment-manager, then a quality-gate verification pass.
 */
import type { AgentContext, AgentResult, Workflow } from '../types';
import { getAgent } from '../agents';

export const deployWorkflow: Workflow = {
  name: 'deploy',
  description: 'Upload, publish, deploy, and activate a UiPath solution, then verify.',
  steps: [
    { name: 'deploy', agent: 'deployment-manager', description: 'Upload + publish + deploy + activate' },
    { name: 'verify', agent: 'quality-gate', description: 'Post-deploy validation + tests' },
  ],
  async run(ctx: AgentContext): Promise<AgentResult[]> {
    const results: AgentResult[] = [];
    const deployer = getAgent('deployment-manager');
    const gate = getAgent('quality-gate');
    if (deployer) results.push(await deployer.run(ctx));
    if (gate) results.push(await gate.run(ctx));
    return results;
  },
};
