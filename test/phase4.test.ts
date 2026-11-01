/**
 * Tests for Phase 4: recovery (recommend-only), environments, and rollback.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { setupScript, testCtx } from './helpers';
import { classifyFailure, recommendFix, attemptRecovery } from '../src/engine/recovery';
import { loadEnvironments, checkGates, promote } from '../src/engine/environments';
import { recordPreDeployVersions, loadLastSnapshot, rollback } from '../src/engine/rollback';
import type { AgentContext } from '../src/types';

const TMP = os.tmpdir();
const TMP_CWD = path.join(TMP, `omu-phase4-test-${process.pid}`);

try { fs.mkdirSync(TMP_CWD, { recursive: true }); } catch (_) { /* ignore */ }

function tmpCtx(opts: Partial<AgentContext> = {}): AgentContext {
  return {
    ...testCtx(opts),
    cwd: opts.cwd ?? TMP_CWD,
  };
}

// ─── classifyFailure ───────────────────────────────────────────────

describe('classifyFailure', () => {
  it('classifies stale binding as AUTHORING', () => {
    assert.equal(classifyFailure('stale binding detected'), 'AUTHORING');
  });

  it('classifies pack failed as AUTHORING', () => {
    assert.equal(classifyFailure('pack failed: missing project.json'), 'AUTHORING');
  });

  it('classifies version already exists as TENANT', () => {
    assert.equal(classifyFailure('version already exists in feed'), 'TENANT');
  });

  it('classifies auth token expired as TENANT', () => {
    assert.equal(classifyFailure('auth token expired'), 'TENANT');
  });

  it('returns NONE for unknown errors', () => {
    assert.equal(classifyFailure('something unexpected happened'), 'NONE');
  });
});

// ─── recommendFix ──────────────────────────────────────────────────

describe('recommendFix', () => {
  it('recommends resources refresh for stale bindings', () => {
    const fix = recommendFix('AUTHORING', 'stale binding detected');
    assert.deepEqual(fix, ['solution', 'resources', 'refresh']);
  });

  it('recommends pack with placeholder for pack failures', () => {
    const fix = recommendFix('AUTHORING', 'pack failed: missing project.json');
    assert.deepEqual(fix, ['solution', 'pack', '<solutionPath>']);
  });

  it('recommends login refresh for auth errors', () => {
    const fix = recommendFix('TENANT', 'auth token expired');
    assert.deepEqual(fix, ['login', 'refresh']);
  });

  it('recommends empty for NONE', () => {
    const fix = recommendFix('NONE', 'unknown error');
    assert.deepEqual(fix, []);
  });
});

// ─── attemptRecovery (recommend-only, never auto-applies) ───────────

describe('attemptRecovery', () => {
  beforeEach(() => {
    setupScript([
      { match: 'or folders list', exitCode: 0, stdout: '[]' },
      { match: 'or jobs logs', exitCode: 0, stdout: '{}' },
      { match: 'or jobs get', exitCode: 0, stdout: '{}' },
      { match: 'solution deploy status', exitCode: 0, stdout: '{}' },
    ]);
  });

  it('dry-run returns recommendation for AUTHORING fix (never applies)', async () => {
    const ctx = tmpCtx({ dryRun: true });
    const r = await attemptRecovery(ctx, 'build', 'stale binding detected', 0);
    assert.equal(r.fixType, 'AUTHORING');
    assert.equal(r.applied, false); // never auto-applies
    assert.ok(r.output.includes('Recommended'));
  });

  it('returns recommendation for TENANT fix (needs confirmation)', async () => {
    const ctx = tmpCtx({ dryRun: true });
    const r = await attemptRecovery(ctx, 'deploy', 'version already exists', 0);
    assert.equal(r.fixType, 'TENANT');
    assert.equal(r.requiresConfirmation, true);
    assert.equal(r.applied, false); // never auto-applies
  });

  it('returns NO FIX for unclassifiable errors', async () => {
    const ctx = tmpCtx({ dryRun: true });
    const r = await attemptRecovery(ctx, 'test', 'something weird happened', 0);
    assert.equal(r.fixType, 'NONE');
    assert.equal(r.applied, false);
  });
});

// ─── Environments ──────────────────────────────────────────────────

describe('loadEnvironments', () => {
  it('returns default config when no .omu-env.json', () => {
    const ctx = tmpCtx();
    const env = loadEnvironments(ctx);
    assert.equal(env.dev.tenant, 'Dev');
    assert.equal(env.prod.requireConfirmation, true);
  });

  it('reads custom config from .omu-env.json', () => {
    const ctx = tmpCtx();
    const envPath = path.join(TMP_CWD, '.omu-env.json');
    fs.writeFileSync(envPath, JSON.stringify({
      dev: { tenant: 'MyDev', folder: 'Shared', requireValidation: true, requireReview: true, minTestPassRate: 0.5, requireConfirmation: false },
      test: { tenant: 'MyTest', folder: 'Shared', requireValidation: true, requireReview: true, minTestPassRate: 0.8, requireConfirmation: false },
      prod: { tenant: 'MyProd', folder: 'Shared', requireValidation: true, requireReview: true, minTestPassRate: 1.0, requireConfirmation: true },
    }));
    const env = loadEnvironments(ctx);
    assert.equal(env.dev.tenant, 'MyDev');
    fs.unlinkSync(envPath);
  });
});

describe('checkGates', () => {
  it('passes all gates when conditions are met', () => {
    const target = { tenant: 'Test', folder: 'Shared', requireValidation: true, requireReview: true, minTestPassRate: 0.9, requireConfirmation: false };
    const r = checkGates(target, { validationPassed: true, criticalFindings: 0, testPassRate: 0.95 });
    assert.equal(r.passed, true);
  });

  it('fails when validation did not pass', () => {
    const target = { tenant: 'Test', folder: 'Shared', requireValidation: true, requireReview: true, minTestPassRate: 0.9, requireConfirmation: false };
    const r = checkGates(target, { validationPassed: false, criticalFindings: 0, testPassRate: 1.0 });
    assert.equal(r.passed, false);
  });

  it('fails when Critical findings exist', () => {
    const target = { tenant: 'Test', folder: 'Shared', requireValidation: true, requireReview: true, minTestPassRate: 0.9, requireConfirmation: false };
    const r = checkGates(target, { validationPassed: true, criticalFindings: 2, testPassRate: 1.0 });
    assert.equal(r.passed, false);
  });

  it('fails when test pass rate is below threshold', () => {
    const target = { tenant: 'Test', folder: 'Shared', requireValidation: true, requireReview: true, minTestPassRate: 0.9, requireConfirmation: false };
    const r = checkGates(target, { validationPassed: true, criticalFindings: 0, testPassRate: 0.7 });
    assert.equal(r.passed, false);
  });
});

describe('promote', () => {
  it('requires --confirm for prod', async () => {
    const ctx = tmpCtx();
    const r = await promote(ctx, 'test', 'prod', {
      validationPassed: true, criticalFindings: 0, testPassRate: 1.0, confirm: false,
    });
    assert.equal(r.success, false);
    assert.ok(r.output.includes('--confirm'));
  });

  it('dry-run prints gates for dev → test', async () => {
    const ctx = tmpCtx({ dryRun: true });
    const r = await promote(ctx, 'dev', 'test', {
      validationPassed: true, criticalFindings: 0, testPassRate: 0.95,
    });
    assert.equal(r.success, true);
    assert.ok(r.gatesPassed);
  });

  it('fails gates when validation not passed', async () => {
    const ctx = tmpCtx({ dryRun: true });
    const r = await promote(ctx, 'dev', 'test', {
      validationPassed: false, criticalFindings: 0, testPassRate: 1.0,
    });
    assert.equal(r.success, false);
    assert.equal(r.gatesPassed, false);
  });
});

// ─── Rollback ──────────────────────────────────────────────────────

describe('rollback', () => {
  beforeEach(() => {
    setupScript([
      { match: 'or processes list', exitCode: 0, stdout: JSON.stringify({
        Data: [
          { Key: 'proc-1', Name: 'MyProcess', Version: '1.0.0' },
          { Key: 'proc-2', Name: 'OtherProcess', Version: '2.1.0' },
        ],
      })},
      { match: 'or processes rollback', exitCode: 0, stdout: '{}' },
    ]);
  });

  it('records and loads a snapshot', () => {
    const ctx = tmpCtx();
    const snap = recordPreDeployVersions(ctx, 'prod');
    assert.equal(snap.env, 'prod');
    assert.equal(snap.processes.length, 2);
    assert.equal(snap.processes[0].key, 'proc-1');

    const loaded = loadLastSnapshot(ctx, 'prod');
    assert.ok(loaded);
    assert.equal(loaded.processes.length, 2);
  });

  it('dry-run rollback prints what would be rolled back', async () => {
    const ctx = tmpCtx();
    recordPreDeployVersions(ctx, 'prod');
    const dryCtx = tmpCtx({ dryRun: true });
    const r = await rollback(dryCtx, 'prod');
    assert.equal(r.success, true);
    assert.ok(r.output.includes('dry-run'));
    assert.ok(r.rolledBack.length > 0);
  });

  it('returns failure when no snapshot exists', async () => {
    const ctx = tmpCtx();
    const versionsPath = path.join(TMP_CWD, '.omu-versions.json');
    try { fs.unlinkSync(versionsPath); } catch (_) { /* ignore */ }
    const r = await rollback(ctx, 'nonexistent');
    assert.equal(r.success, false);
    assert.ok(r.output.includes('No version snapshot'));
  });
});