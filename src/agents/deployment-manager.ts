/**
 * deployment-manager — publishes and deploys a packed `.uipx` package.
 *
 * Owns: moving a packed `.uipx` (a `.zip` produced by `uip solution pack`)
 * into a target tenant/folder — publishing it to the feed and deploying it.
 * `solution deploy run` auto-activates by default, so no separate activate
 * step is needed. Maps to `uip solution publish/deploy` and the
 * `uipath-solution` + `uipath-platform` skills.
 *
 * Verified against `uip solution --help` (v1.202.1):
 * - `uip solution publish <packagePath>` — positional, a `.zip` from `solution pack`
 * - `uip solution deploy run --parent-folder-path <path> [--name <deployment-name>]`
 *   — `--name` is optional; auto-activates unless `--skip-activate` is passed
 *
 * NOT used (verified against --help):
 * - `uip solution upload` — uploads to Studio Web for browser editing, NOT deployment
 * - `uip solution deploy activate` — only needed after `--skip-activate`; we never pass it
 */
import * as path from 'node:path';
import type { Agent, AgentContext, AgentResult } from '../types';
import { runUipChain, makeChainResult, planResult } from '../config';
import { recordPreDeployVersions } from '../engine/rollback';

export const deploymentManager: Agent = {
  name: 'deployment-manager',
  role:
    'Publishes a packed .uipx (.zip) and deploys it into a target tenant/folder. deploy run auto-activates.',
  skills: ['uipath-solution', 'uipath-platform'],
  commands: ['uip solution publish', 'uip solution deploy run'],
  async run(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now();
    // ctx.solutionPath points at the packed .zip produced by `uip solution pack`.
    const packagePath = ctx.solutionPath ?? path.join(ctx.cwd, 'dist', 'solution.zip');
    const parentFolder = ctx.folder ?? 'Shared';
    // Derive the deployment name from the package basename (no hardcoded name).
    const deploymentName = path.basename(packagePath, path.extname(packagePath));

    if (ctx.dryRun) {
      return planResult('deployment-manager', [
        `record pre-deploy versions (uip or processes list)`,
        `solution publish ${packagePath}`,
        `solution deploy run --parent-folder-path ${parentFolder} --name ${deploymentName}`,
      ], [], start);
    }

    // Record pre-deploy versions for rollback.
    recordPreDeployVersions(ctx, ctx.tenant ?? 'default');

    const chain = runUipChain(ctx, [
      { args: ['solution', 'publish', packagePath], label: 'solution publish' },
      {
        args: ['solution', 'deploy', 'run', '--parent-folder-path', parentFolder, '--name', deploymentName],
        label: 'solution deploy run',
      },
    ]);
    return makeChainResult('deployment-manager', chain, [], start);
  },
};