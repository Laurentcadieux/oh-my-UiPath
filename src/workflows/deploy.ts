/**
 * deploy workflow — publish -> deploy, then post-deploy verification.
 * Chains deployment-manager (publish + deploy run) then quality-gate
 * (verify a Successful deployment landed in the folder).
 */
import type { AgentContext, AgentResult, Workflow } from '../types';
import { getAgent } from '../agents';

export const deployWorkflow: Workflow = {
  name: 'deploy',
  description: 'Publish + deploy a UiPath solution, then verify the deployment.',
  steps: [
    { name: 'deploy', agent: 'deployment-manager', description: 'Publish + deploy the .uipx' },
    { name: 'verify', agent: 'quality-gate', description: 'Post-deploy verification' },
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