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
  it('dry-run returns plan results', async () => {
    setupScript([]);
    const res = await autopilotWorkflow.run(testCtx({ dryRun: true }));
    assert.ok(res.length > 0);
    assert.equal(res.every((r: any) => r.success), true);
  });

  it('stops on first failing agent', async () => {
    setupScript([
      { match: 'or folders list', exitCode: 0, stdout: '[]' },
      { match: 'maestro case init', exitCode: 1, stderr: 'error' },
    ]);
    const res = await autopilotWorkflow.run(testCtx());
    // orchestrator passes, case-architect fails, pipeline stops
    assert.ok(res.some((r: any) => !r.success));
    const failed = res.find((r: any) => !r.success);
    assert.ok(failed);
  });
});

describe('build workflow', () => {
  it('dry-run returns plan results', async () => {
    setupScript([]);
    const res = await buildWorkflow.run(testCtx({ dryRun: true }));
    assert.ok(res.length > 0);
    assert.equal(res.every((r: any) => r.success), true);
  });
});

describe('deploy workflow', () => {
  it('dry-run returns plan results', async () => {
    setupScript([]);
    const res = await deployWorkflow.run(testCtx({ dryRun: true }));
    assert.ok(res.length > 0);
    assert.equal(res.every((r: any) => r.success), true);
  });
});