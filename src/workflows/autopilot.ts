/**
 * autopilot workflow — the full SDD-to-deploy pipeline.
 * plan -> build -> review -> deploy -> test, orchestrated end to end.
 *
 * The reviewer step (uipath-review) runs after build and before deploy,
 * gating the pipeline on Critical findings. The diagnostician
 * (uipath-troubleshoot) runs on failure to diagnose the root cause.
 */
import type { AgentContext, AgentResult, Workflow } from '../types';
import { getAgent } from '../agents';

export const autopilotWorkflow: Workflow = {
  name: 'autopilot',
  description: 'Full SDD-to-deploy pipeline: plan -> build -> review -> deploy -> test.',
  steps: [
    { name: 'plan', agent: 'orchestrator', description: 'Resolve context and plan the pipeline' },
    { name: 'case', agent: 'case-architect', description: 'Design + validate caseplan.json from SDD' },
    { name: 'build', agent: 'solution-builder', description: 'Init, restore, pack .uipx' },
    { name: 'review', agent: 'reviewer', description: 'Validate + review before deploy (uipath-review)' },
    { name: 'deploy', agent: 'deployment-manager', description: 'Upload, publish, deploy, activate' },
    { name: 'test', agent: 'quality-gate', description: 'Post-deploy verification + tests' },
  ],
  async run(ctx: AgentContext): Promise<AgentResult[]> {
    const results: AgentResult[] = [];
    const sequence = [
      'orchestrator',
      'case-architect',
      'solution-builder',
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