/**
 * Tests for every agent — happy path, failure path, and --dry-run.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setupScript, testCtx } from './helpers';
import { orchestrator } from '../src/agents/orchestrator';
import { solutionBuilder } from '../src/agents/solution-builder';
import { caseArchitect } from '../src/agents/case-architect';
import { deploymentManager } from '../src/agents/deployment-manager';
import { qualityGate } from '../src/agents/quality-gate';

describe('orchestrator', () => {
  it('dry-run returns plan without calling uip', async () => {
    setupScript([]);
    const res = await orchestrator.run(testCtx({ dryRun: true }));
    assert.equal(res.success, true);
    assert.equal(res.agent, 'orchestrator');
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

describe('solution-builder', () => {
  it('dry-run returns plan', async () => {
    setupScript([]);
    const res = await solutionBuilder.run(testCtx({ dryRun: true }));
    assert.equal(res.success, true);
  });

  it('happy path: init + restore + pack', async () => {
    setupScript([
      { match: 'solution init', exitCode: 0, stdout: 'created' },
      { match: 'solution restore', exitCode: 0, stdout: 'restored' },
      { match: 'solution pack', exitCode: 0, stdout: 'packed' },
    ]);
    const res = await solutionBuilder.run(testCtx());
    assert.equal(res.success, true);
    assert.equal(res.exitCodes?.length, 3);
  });

  it('stops on restore failure (does not reach pack)', async () => {
    setupScript([
      { match: 'solution init', exitCode: 0, stdout: 'created' },
      { match: 'solution restore', exitCode: 1, stderr: 'no deps' },
      { match: 'solution pack', exitCode: 0, stdout: 'packed' },
    ]);
    const res = await solutionBuilder.run(testCtx());
    assert.equal(res.success, false);
    assert.equal(res.exitCodes?.length, 2); // init + restore only
  });
});

describe('case-architect', () => {
  it('dry-run returns plan', async () => {
    setupScript([]);
    const res = await caseArchitect.run(testCtx({ dryRun: true }));
    assert.equal(res.success, true);
  });

  it('happy path: init + validate + pack', async () => {
    setupScript([
      { match: 'maestro case init', exitCode: 0, stdout: 'created' },
      { match: 'maestro case validate', exitCode: 0, stdout: 'valid' },
      { match: 'maestro case pack', exitCode: 0, stdout: 'packed' },
    ]);
    const res = await caseArchitect.run(testCtx());
    assert.equal(res.success, true);
    assert.equal(res.exitCodes?.length, 3);
  });

  it('stops on validate failure (does not reach pack)', async () => {
    setupScript([
      { match: 'maestro case init', exitCode: 0, stdout: 'created' },
      { match: 'maestro case validate', exitCode: 1, stderr: 'invalid json' },
      { match: 'maestro case pack', exitCode: 0, stdout: 'packed' },
    ]);
    const res = await caseArchitect.run(testCtx());
    assert.equal(res.success, false);
    assert.equal(res.exitCodes?.length, 2); // init + validate only
  });
});

describe('deployment-manager', () => {
  it('dry-run returns plan', async () => {
    setupScript([]);
    const res = await deploymentManager.run(testCtx({ dryRun: true }));
    assert.equal(res.success, true);
  });

  it('happy path: upload + publish + deploy run + activate', async () => {
    setupScript([
      { match: 'solution upload', exitCode: 0, stdout: 'uploaded' },
      { match: 'solution publish', exitCode: 0, stdout: 'published' },
      { match: 'solution deploy run', exitCode: 0, stdout: 'deployed' },
      { match: 'solution deploy activate', exitCode: 0, stdout: 'activated' },
    ]);
    const res = await deploymentManager.run(testCtx());
    assert.equal(res.success, true);
    assert.equal(res.exitCodes?.length, 4);
  });

  it('stops on upload failure (does not publish/deploy/activate)', async () => {
    setupScript([
      { match: 'solution upload', exitCode: 1, stderr: 'no package' },
      { match: 'solution publish', exitCode: 0, stdout: 'published' },
      { match: 'solution deploy run', exitCode: 0, stdout: 'deployed' },
      { match: 'solution deploy activate', exitCode: 0, stdout: 'activated' },
    ]);
    const res = await deploymentManager.run(testCtx());
    assert.equal(res.success, false);
    assert.equal(res.exitCodes?.length, 1); // upload only
  });
});

describe('quality-gate', () => {
  it('dry-run returns plan', async () => {
    setupScript([]);
    const res = await qualityGate.run(testCtx({ dryRun: true }));
    assert.equal(res.success, true);
  });

  it('happy path: case validate', async () => {
    setupScript([
      { match: 'maestro case validate', exitCode: 0, stdout: 'valid' },
    ]);
    const res = await qualityGate.run(testCtx());
    assert.equal(res.success, true);
    assert.equal(res.exitCodes?.length, 1);
  });

  it('failure path: validate fails', async () => {
    setupScript([
      { match: 'maestro case validate', exitCode: 1, stderr: 'invalid' },
    ]);
    const res = await qualityGate.run(testCtx());
    assert.equal(res.success, false);
  });
});