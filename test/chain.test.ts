/**
 * Tests for runUipChain — stop-on-failure behaviour.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupScript, testCtx } from './helpers';
import { runUipChain } from '../src/config';
import type { UipStep } from '../src/config';

const ctx = testCtx();

describe('runUipChain', () => {
  beforeEach(() => {
    setupScript([
      { match: 'init', exitCode: 0, stdout: 'initialized' },
      { match: 'restore', exitCode: 0, stdout: 'restored' },
      { match: 'pack', exitCode: 0, stdout: 'packed' },
      { match: 'fail-step', exitCode: 1, stdout: '', stderr: 'error: bad input' },
    ]);
  });

  it('runs all steps when all succeed', () => {
    const steps: UipStep[] = [
      { args: ['init'], label: 'step 1' },
      { args: ['restore'], label: 'step 2' },
      { args: ['pack'], label: 'step 3' },
    ];
    const result = runUipChain(ctx, steps);
    assert.equal(result.failedLabel, undefined);
    assert.equal(result.results.length, 3);
    assert.equal(result.results[0].exitCode, 0);
    assert.equal(result.results[2].exitCode, 0);
  });

  it('stops on first failure and skips remaining', () => {
    const steps: UipStep[] = [
      { args: ['init'], label: 'step 1' },
      { args: ['fail-step'], label: 'step 2' },
      { args: ['pack'], label: 'step 3' },
    ];
    const result = runUipChain(ctx, steps);
    assert.equal(result.failedLabel, 'step 2');
    assert.equal(result.results.length, 2);
    assert.equal(result.results[0].exitCode, 0);
    assert.equal(result.results[1].exitCode, 1);
    // Step 3 was never run
    assert.equal(result.results.length, 2);
  });

  it('returns empty results for empty steps', () => {
    const result = runUipChain(ctx, []);
    assert.equal(result.failedLabel, undefined);
    assert.equal(result.results.length, 0);
  });
});