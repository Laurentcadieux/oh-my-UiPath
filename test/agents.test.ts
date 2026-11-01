/**
 * Tests for every agent — happy path, failure path, and --dry-run.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setupScript, testCtx } from './helpers';
import { orchestrator } from '../src/agents/orchestrator';
import { deploymentManager } from '../src/agents/deployment-manager';
import { qualityGate } from '../src/agents/quality-gate';

describe('orchestrator', () => {
  it('dry-run returns plan without calling uip', async () => {
    setupScript([]);
    const res = await orchestrator.run(testCtx({ dryRun: true }));
    assert.equal(res.success, true);
    assert.equal(res.agent, 'orchestrator');
    // The plan describes the new 4-stage pipeline.
    assert.ok(res.output.includes('plan -> review -> deploy -> test'));
  });

  it('happy path calls or folders list', async () => {
    setupScript([
      { match: 'or folders list', exitCode: 0, stdout: '[]' },
    ]);
    const res = await orchestrator.run(testCtx());
    assert.equal(res.success, true);
  });

  it('failure path: folders list fails', async () => {
    setupScript([
      { match: 'or folders list', exitCode: 1, stderr: 'auth required' },
    ]);
    const res = await orchestrator.run(testCtx());
    assert.equal(res.success, false);
  });
});

describe('deployment-manager', () => {
  it('dry-run returns plan', async () => {
    setupScript([]);
    const res = await deploymentManager.run(testCtx({ dryRun: true }));
    assert.equal(res.success, true);
    assert.equal(res.agent, 'deployment-manager');
    // No upload, no activate; publish + deploy run only.
    assert.ok(res.output.includes('solution publish'));
    assert.ok(res.output.includes('solution deploy run'));
    assert.ok(!res.output.includes('solution upload'));
    assert.ok(!res.output.includes('solution deploy activate'));
    // No hardcoded 'hermes-' name.
    assert.ok(!res.output.includes('hermes-deployment'));
  });

  it('happy path: publish + deploy run (no upload, no activate)', async () => {
    setupScript([
      { match: 'or processes list', exitCode: 0, stdout: '{"Data":[]}' },
      { match: 'solution publish', exitCode: 0, stdout: 'published' },
      { match: 'solution deploy run', exitCode: 0, stdout: 'deployed' },
    ]);
    const res = await deploymentManager.run(testCtx({ solutionPath: '/tmp/my-solution.zip' }));
    assert.equal(res.success, true);
    assert.equal(res.exitCodes?.length, 2); // publish + deploy run only
  });

  it('passes --parent-folder-path from ctx.folder and a derived --name', async () => {
    setupScript([
      { match: 'or processes list', exitCode: 0, stdout: '{"Data":[]}' },
      { match: 'solution publish', exitCode: 0, stdout: 'published' },
      { match: 'solution deploy run', exitCode: 0, stdout: 'deployed' },
    ]);
    const res = await deploymentManager.run(
      testCtx({ solutionPath: '/tmp/my-solution.zip', folder: 'ProdFolder' }),
    );
    assert.equal(res.success, true);
    // The deploy run call used the derived name (basename) and the folder.
    assert.ok(res.output.includes('--parent-folder-path ProdFolder'));
    assert.ok(res.output.includes('--name my-solution'));
  });

  it('stops on publish failure (does not reach deploy run)', async () => {
    setupScript([
      { match: 'or processes list', exitCode: 0, stdout: '{"Data":[]}' },
      { match: 'solution publish', exitCode: 1, stderr: 'bad package' },
      { match: 'solution deploy run', exitCode: 0, stdout: 'deployed' },
    ]);
    const res = await deploymentManager.run(testCtx({ solutionPath: '/tmp/x.zip' }));
    assert.equal(res.success, false);
    assert.equal(res.exitCodes?.length, 1); // publish only
  });
});

describe('quality-gate', () => {
  it('dry-run returns plan', async () => {
    setupScript([]);
    const res = await qualityGate.run(testCtx({ dryRun: true }));
    assert.equal(res.success, true);
    assert.equal(res.agent, 'quality-gate');
    assert.ok(res.output.includes('solution deploy list'));
  });

  it('happy path: a Successful deployment exists in the folder', async () => {
    setupScript([
      {
        match: 'solution deploy list',
        exitCode: 0,
        stdout: JSON.stringify({
          Data: [{ Name: 'dep-1', OperationStatus: 'Successful' }],
        }),
      },
    ]);
    const res = await qualityGate.run(testCtx({ folder: 'ProdFolder' }));
    assert.equal(res.success, true);
    assert.ok(res.output.includes('Successful'));
  });

  it('failure path: deployments exist but none Successful', async () => {
    setupScript([
      {
        match: 'solution deploy list',
        exitCode: 0,
        stdout: JSON.stringify({
          Data: [{ Name: 'dep-1', OperationStatus: 'Failed' }],
        }),
      },
    ]);
    const res = await qualityGate.run(testCtx());
    assert.equal(res.success, false);
    assert.ok(res.output.includes('none Successful'));
  });

  it('failure path: no deployments in the folder', async () => {
    setupScript([
      { match: 'solution deploy list', exitCode: 0, stdout: '{"Data":[]}' },
    ]);
    const res = await qualityGate.run(testCtx());
    assert.equal(res.success, false);
    assert.ok(res.output.includes('none Successful'));
  });

  it('failure path: deploy list command fails', async () => {
    setupScript([
      { match: 'solution deploy list', exitCode: 1, stderr: 'auth required' },
    ]);
    const res = await qualityGate.run(testCtx());
    assert.equal(res.success, false);
  });
});