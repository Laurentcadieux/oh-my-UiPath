/**
 * Tests for the Phase 2 agents: diagnostician and reviewer.
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

describe('reviewer — severity parsing', () => {
  it('dry-run returns plan', async () => {
    setupScript([]);
    const res = await reviewer.run(testCtx({ dryRun: true }));
    assert.equal(res.success, true);
    assert.equal(res.agent, 'reviewer');
  });

  it('happy path: all validations pass (Info)', async () => {
    setupScript([
      { match: 'rpa validate', exitCode: 0, stdout: '{"Errors":0,"Warnings":0}' },
      { match: 'rpa build', exitCode: 0, stdout: '{"Errors":0,"Warnings":0}' },
      { match: 'maestro case validate', exitCode: 0, stdout: '{"Errors":0}' },
    ]);
    const res = await reviewer.run(testCtx());
    assert.equal(res.success, true);
    assert.equal(res.exitCodes?.length, 3);
    // No Critical findings in the output.
    assert.ok(!res.output.includes('[Critical]'));
  });

  it('stops on rpa validate non-zero exit (Critical, does not reach build/case)', async () => {
    setupScript([
      { match: 'rpa validate', exitCode: 1, stderr: 'validation error' },
      { match: 'rpa build', exitCode: 0, stdout: '{}' },
      { match: 'maestro case validate', exitCode: 0, stdout: '{}' },
    ]);
    const res = await reviewer.run(testCtx());
    assert.equal(res.success, false);
    assert.equal(res.exitCodes?.length, 1); // only rpa validate ran
    assert.ok(res.output.includes('[Critical]'));
  });

  it('Result: Failure with zero exit is Critical (chain still runs all)', async () => {
    setupScript([
      { match: 'rpa validate', exitCode: 0, stdout: '{"Result":"Failure","Errors":0}' },
      { match: 'rpa build', exitCode: 0, stdout: '{"Errors":0}' },
      { match: 'maestro case validate', exitCode: 0, stdout: '{"Errors":0}' },
    ]);
    const res = await reviewer.run(testCtx());
    assert.equal(res.success, false);
    assert.equal(res.exitCodes?.length, 3); // all ran (zero exits)
    assert.ok(res.output.includes('[Critical]'));
    assert.ok(res.output.includes('Result=Failure'));
  });

  it('Result: ValidationError is Critical', async () => {
    setupScript([
      { match: 'rpa validate', exitCode: 0, stdout: '{"Errors":0}' },
      { match: 'rpa build', exitCode: 0, stdout: '{"Errors":0}' },
      { match: 'maestro case validate', exitCode: 0, stdout: '{"Result":"ValidationError"}' },
    ]);
    const res = await reviewer.run(testCtx());
    assert.equal(res.success, false);
    assert.ok(res.output.includes('[Critical]'));
    assert.ok(res.output.includes('ValidationError'));
  });

  it('non-zero Error count is Critical even with zero exit', async () => {
    setupScript([
      { match: 'rpa validate', exitCode: 0, stdout: '{"Errors":3,"Warnings":1}' },
      { match: 'rpa build', exitCode: 0, stdout: '{"Errors":0}' },
      { match: 'maestro case validate', exitCode: 0, stdout: '{"Errors":0}' },
    ]);
    const res = await reviewer.run(testCtx());
    assert.equal(res.success, false);
    assert.ok(res.output.includes('[Critical]'));
    assert.ok(res.output.includes('error(s)'));
  });

  it('warnings without errors do not gate (Warning, not Critical)', async () => {
    setupScript([
      { match: 'rpa validate', exitCode: 0, stdout: '{"Errors":0,"Warnings":2}' },
      { match: 'rpa build', exitCode: 0, stdout: '{"Errors":0}' },
      { match: 'maestro case validate', exitCode: 0, stdout: '{"Errors":0}' },
    ]);
    const res = await reviewer.run(testCtx());
    assert.equal(res.success, true);
    assert.ok(res.output.includes('[Warning]'));
    assert.ok(!res.output.includes('[Critical]'));
  });

  it('non-JSON stdout with zero exit is treated as a pass', async () => {
    setupScript([
      { match: 'rpa validate', exitCode: 0, stdout: 'all good' },
      { match: 'rpa build', exitCode: 0, stdout: 'ok' },
      { match: 'maestro case validate', exitCode: 0, stdout: 'valid' },
    ]);
    const res = await reviewer.run(testCtx());
    assert.equal(res.success, true);
  });
});