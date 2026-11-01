/**
 * Tests for workflows — autopilot, build, deploy — including --dry-run.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setupScript, testCtx } from './helpers';
import { autopilotWorkflow } from '../src/workflows/autopilot';
import { buildWorkflow } from '../src/workflows/build';
import { deployWorkflow } from '../src/workflows/deploy';

describe('autopilot workflow', () => {
  it('dry-run returns plan results for the 4-stage pipeline', async () => {
    setupScript([]);
    const res = await autopilotWorkflow.run(testCtx({ dryRun: true }));
    assert.ok(res.length > 0);
    assert.equal(res.every((r: any) => r.success), true);
    // Four agents run in dry-run: orchestrator, reviewer, deployment-manager, quality-gate.
    assert.equal(res.length, 4);
    assert.equal(res[0].agent, 'orchestrator');
    assert.equal(res[1].agent, 'reviewer');
    assert.equal(res[2].agent, 'deployment-manager');
    assert.equal(res[3].agent, 'quality-gate');
  });

  it('stops on first failing agent and runs the diagnostician', async () => {
    // orchestrator passes; reviewer fails on rpa validate; pipeline stops.
    setupScript([
      { match: 'or folders list', exitCode: 0, stdout: '[]' },
      { match: 'rpa validate', exitCode: 1, stderr: 'validation error' },
    ]);
    const res = await autopilotWorkflow.run(testCtx());
    assert.ok(res.length >= 2); // orchestrator + reviewer (+ diagnostician)
    assert.ok(res.some((r: any) => !r.success));
    const failed = res.find((r: any) => !r.success);
    assert.ok(failed);
    // The diagnostician ran after the failure.
    assert.ok(res.some((r: any) => r.agent === 'diagnostician'));
  });
});

describe('build workflow', () => {
  it('dry-run returns a single reviewer plan result', async () => {
    setupScript([]);
    const res = await buildWorkflow.run(testCtx({ dryRun: true }));
    assert.equal(res.length, 1);
    assert.equal(res[0].agent, 'reviewer');
    assert.equal(res.every((r: any) => r.success), true);
  });
});

describe('deploy workflow', () => {
  it('dry-run returns plan results for deploy + verify', async () => {
    setupScript([]);
    const res = await deployWorkflow.run(testCtx({ dryRun: true }));
    assert.ok(res.length > 0);
    assert.equal(res.every((r: any) => r.success), true);
    assert.equal(res.length, 2); // deployment-manager + quality-gate
    assert.equal(res[0].agent, 'deployment-manager');
    assert.equal(res[1].agent, 'quality-gate');
  });
});