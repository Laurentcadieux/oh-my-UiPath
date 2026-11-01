/**
 * Tests for the new Phase 2 agents: diagnostician and reviewer.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setupScript, testCtx } from './helpers';
import { diagnostician } from '../src/agents/diagnostician';
import { reviewer } from '../src/agents/reviewer';

describe('diagnostician', () => {
  it('dry-run returns plan', async () => {
    setupScript([]);
    const res = await diagnostician.run(testCtx({ dryRun: true }));
    assert.equal(res.success, true);
    assert.equal(res.agent, 'diagnostician');
  });

  it('happy path: folders list succeeds', async () => {
    setupScript([
      { match: 'or folders list', exitCode: 0, stdout: '[]' },
    ]);
    const res = await diagnostician.run(testCtx());
    assert.equal(res.success, true);
  });

  it('failure path: folders list fails', async () => {
    setupScript([
      { match: 'or folders list', exitCode: 1, stderr: 'auth required' },
    ]);
    const res = await diagnostician.run(testCtx());
    assert.equal(res.success, false);
  });
});

describe('reviewer', () => {
  it('dry-run returns plan', async () => {
    setupScript([]);
    const res = await reviewer.run(testCtx({ dryRun: true }));
    assert.equal(res.success, true);
    assert.equal(res.agent, 'reviewer');
  });

  it('happy path: all validations pass', async () => {
    setupScript([
      { match: 'rpa validate', exitCode: 0, stdout: '{"Errors":0,"Warnings":0}' },
      { match: 'rpa build', exitCode: 0, stdout: '{"Errors":0,"Warnings":0}' },
      { match: 'maestro case validate', exitCode: 0, stdout: '{"Errors":0}' },
    ]);
    const res = await reviewer.run(testCtx());
    assert.equal(res.success, true);
    assert.equal(res.exitCodes?.length, 3);
  });

  it('stops on rpa validate failure (does not reach build/case)', async () => {
    setupScript([
      { match: 'rpa validate', exitCode: 1, stderr: 'validation error' },
      { match: 'rpa build', exitCode: 0, stdout: 'ok' },
      { match: 'maestro case validate', exitCode: 0, stdout: 'ok' },
    ]);
    const res = await reviewer.run(testCtx());
    assert.equal(res.success, false);
    assert.equal(res.exitCodes?.length, 1); // only rpa validate ran
  });
});