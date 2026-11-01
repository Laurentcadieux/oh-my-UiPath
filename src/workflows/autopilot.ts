/**
 * autopilot workflow — the full pipeline.
 * plan -> review -> deploy -> test, orchestrated end to end.
 *
 * The reviewer gates the pipeline on Critical findings before deploy.
 * The quality-gate verifies the live deployment afterwards. The
 * diagnostician runs on failure to diagnose the root cause.
 */
import type { AgentContext, AgentResult, Workflow } from '../types';
import { getAgent } from '../agents';

export const autopilotWorkflow: Workflow = {
  name: 'autopilot',
  description: 'Full pipeline: plan -> review -> deploy -> test.',
  steps: [
    { name: 'plan', agent: 'orchestrator', description: 'Resolve context and plan the pipeline' },
    { name: 'review', agent: 'reviewer', description: 'Validate + review before deploy (gates on Critical)' },
    { name: 'deploy', agent: 'deployment-manager', description: 'Publish + deploy the .uipx' },
    { name: 'test', agent: 'quality-gate', description: 'Post-deploy verification' },
  ],
  async run(ctx: AgentContext): Promise<AgentResult[]> {
    const results: AgentResult[] = [];
    const sequence = [
      'orchestrator',
      'reviewer',
      'deployment-manager',
      'quality-gate',
    ];

    for (const name of sequence) {
      const agent = getAgent(name);
      if (!agent) continue;
      const res = await agent.run(ctx);
      results.push(res);

      // Fail fast: stop the pipeline on the first failing agent.
      if (!res.success) {
        // Run the diagnostician to diagnose the failure.
        const diag = getAgent('diagnostician');
        if (diag) {
          const diagRes = await diag.run({
            ...ctx,
            labels: {
              ...(ctx.labels ?? {}),
              ['failed-step']: name,
              ['failed-output']: res.output.slice(0, 4096),
            },
          });
          results.push(diagRes);
        }
        break;
      }
    }
    return results;
  },
};