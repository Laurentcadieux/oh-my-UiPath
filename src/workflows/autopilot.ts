/**
 * autopilot workflow — the full SDD-to-deploy pipeline.
 * plan -> build -> validate -> deploy -> test, orchestrated end to end.
 */
import type { AgentContext, AgentResult, Workflow } from '../types';
import { getAgent } from '../agents';

export const autopilotWorkflow: Workflow = {
  name: 'autopilot',
  description: 'Full SDD-to-deploy pipeline: plan -> build -> validate -> deploy -> test.',
  steps: [
    { name: 'plan', agent: 'orchestrator', description: 'Resolve context and plan the pipeline' },
    { name: 'case', agent: 'case-architect', description: 'Design + validate caseplan.json from SDD' },
    { name: 'build', agent: 'solution-builder', description: 'Init, restore, pack .uipx' },
    { name: 'validate', agent: 'quality-gate', description: 'Case validate, RPA analyze, tests' },
    { name: 'deploy', agent: 'deployment-manager', description: 'Upload, publish, deploy, activate' },
    { name: 'test', agent: 'quality-gate', description: 'Post-deploy verification + tests' },
  ],
  async run(ctx: AgentContext): Promise<AgentResult[]> {
    const results: AgentResult[] = [];
    const sequence = [
      'orchestrator',
      'case-architect',
      'solution-builder',
      'quality-gate',
      'deployment-manager',
      'quality-gate',
    ];
    for (const name of sequence) {
      const agent = getAgent(name);
      if (!agent) continue;
      const res = await agent.run(ctx);
      results.push(res);
      // Fail fast: stop the pipeline on the first failing agent.
      if (!res.success) break;
    }
    return results;
  },
};
