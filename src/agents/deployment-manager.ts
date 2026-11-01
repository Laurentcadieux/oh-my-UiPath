/**
 * deployment-manager — uploads, publishes, deploys, and activates solutions.
 *
 * Owns: moving a packed `.uipx` into a target tenant/folder: upload the
 * package, publish the solution, deploy it, and activate the deployment.
 * Maps to `uip solution upload/publish/deploy` and the
 * `uipath-solution` + `uipath-platform` skills.
 *
 * Verified against `uip solution --help` (v1.202.1):
 * - `uip solution upload <solutionPath>` — positional
 * - `uip solution publish <packagePath>` — positional, no --folder flag
 * - `uip solution deploy run --parent-folder-path <path>` — subcommand + flag
 * - `uip solution deploy activate <deployment-name>` — subcommand + positional
 */
import type { Agent, AgentContext, AgentResult } from '../types';
import { runUipChain, makeChainResult, planResult } from '../config';

export const deploymentManager: Agent = {
  name: 'deployment-manager',
  role:
    'Uploads, publishes, deploys, and activates a UiPath solution into a target tenant/folder.',
  skills: ['uipath-solution', 'uipath-platform'],
  commands: [
    'uip solution upload',
    'uip solution publish',
    'uip solution deploy run',
    'uip solution deploy activate',
  ],
  async run(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now();
    const solutionPath = ctx.solutionPath ?? 'dist';
    const packagePath = ctx.solutionPath ?? 'dist';
    const parentFolder = ctx.folder ?? 'Shared';
    const deploymentName = 'hermes-deployment';

    if (ctx.dryRun) {
      return planResult('deployment-manager', [
        `solution upload ${solutionPath}`,
        `solution publish ${packagePath}`,
        `solution deploy run --parent-folder-path ${parentFolder}`,
        `solution deploy activate ${deploymentName}`,
      ], [], start);
    }

    const chain = runUipChain(ctx, [
      { args: ['solution', 'upload', solutionPath], label: 'solution upload' },
      { args: ['solution', 'publish', packagePath], label: 'solution publish' },
      {
        args: ['solution', 'deploy', 'run', '--parent-folder-path', parentFolder],
        label: 'solution deploy run',
      },
      {
        args: ['solution', 'deploy', 'activate', deploymentName],
        label: 'solution deploy activate',
      },
    ]);
    return makeChainResult('deployment-manager', chain, [], start);
  },
};