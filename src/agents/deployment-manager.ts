/**
 * deployment-manager — uploads, publishes, deploys, and activates solutions.
 *
 * Owns: moving a packed `.uipx` into a target tenant/folder: upload the
 * package, publish the solution, deploy it, and activate the deployment.
 * Maps to `uip solution upload/publish/deploy/activate` and the
 * `uipath-solution` + `uipath-platform` skills.
 */
import type { Agent, AgentContext, AgentResult } from '../types';
import { runUip, makeResult, planResult } from '../config';

export const deploymentManager: Agent = {
  name: 'deployment-manager',
  role:
    'Uploads, publishes, deploys, and activates a UiPath solution into a target tenant/folder.',
  skills: ['uipath-solution', 'uipath-platform'],
  commands: [
    'uip solution upload',
    'uip solution publish',
    'uip solution deploy',
    'uip solution activate',
  ],
  async run(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now();
    const target = ctx.solutionPath ?? 'dist';

    const plan = [
      `solution upload --path ${target}`,
      `solution publish${ctx.folder ? ` --folder ${ctx.folder}` : ''}`,
      `solution deploy${ctx.folder ? ` --folder ${ctx.folder}` : ''}`,
      `solution activate`,
    ];

    if (ctx.dryRun) {
      return planResult('deployment-manager', plan, [], start);
    }

    const upload = runUip(ctx, ['solution', 'upload', '--path', target]);
    const publish = runUip(
      ctx,
      ctx.folder ? ['solution', 'publish', '--folder', ctx.folder] : ['solution', 'publish'],
    );
    const deploy = runUip(
      ctx,
      ctx.folder ? ['solution', 'deploy', '--folder', ctx.folder] : ['solution', 'deploy'],
    );
    const activate = runUip(ctx, ['solution', 'activate']);
    return makeResult('deployment-manager', [upload, publish, deploy, activate], [], start);
  },
};
