/**
 * Tests for the Phase 5 safety guard hook.
 *
 * Runs hooks/safety-guard.mjs as a subprocess with scripted stdin and
 * checks the exit code + stderr.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

const GUARD_SCRIPT = path.resolve(__dirname, '..', '..', 'hooks', 'safety-guard.mjs');

/** Run the safety guard with a given command + env, return { exitCode, stderr }. */
function runGuard(bashCommand: string, env: Record<string, string> = {}): { exitCode: number; stderr: string } {
  const payload = JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command: bashCommand },
  });

  const res = spawnSync(process.execPath, [GUARD_SCRIPT], {
    input: payload,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 10000,
  });

  return {
    exitCode: res.status ?? 1,
    stderr: res.stderr ?? '',
  };
}

describe('safety-guard: non-uip commands', () => {
  it('allows non-uip Bash commands (exit 0)', () => {
    const r = runGuard('ls -la');
    assert.equal(r.exitCode, 0);
  });

  it('allows git commands (exit 0)', () => {
    const r = runGuard('git commit -m "test"');
    assert.equal(r.exitCode, 0);
  });

  it('allows npm commands (exit 0)', () => {
    const r = runGuard('npm install');
    assert.equal(r.exitCode, 0);
  });
});

describe('safety-guard: READ_ONLY uip commands', () => {
  it('allows uip or folders list (exit 0)', () => {
    const r = runGuard('uip or folders list --output json');
    assert.equal(r.exitCode, 0);
  });

  it('allows uip or processes list (exit 0)', () => {
    const r = runGuard('uip or processes list --all-folders --output json');
    assert.equal(r.exitCode, 0);
  });

  it('allows uip maestro case validate (exit 0)', () => {
    const r = runGuard('uip maestro case validate caseplan.json --output json');
    assert.equal(r.exitCode, 0);
  });

  it('allows uip login status (exit 0)', () => {
    const r = runGuard('uip login status');
    assert.equal(r.exitCode, 0);
  });
});

describe('safety-guard: AUTHORING uip commands', () => {
  it('allows uip solution init (exit 0)', () => {
    const r = runGuard('uip solution init MySolution');
    assert.equal(r.exitCode, 0);
  });

  it('allows uip solution pack (exit 0)', () => {
    const r = runGuard('uip solution pack MySolution dist');
    assert.equal(r.exitCode, 0);
  });

  it('allows uip solution restore (exit 0)', () => {
    const r = runGuard('uip solution restore MySolution');
    assert.equal(r.exitCode, 0);
  });

  it('allows uip maestro case init (exit 0)', () => {
    const r = runGuard('uip maestro case init MyCase');
    assert.equal(r.exitCode, 0);
  });
});

describe('safety-guard: MUTATING uip commands on Prod', () => {
  beforeEach(() => {
    // Set tenant to Prod
    process.env.UIPATH_CURRENT_TENANT = 'Prod';
  });

  it('blocks uip solution publish on Prod (exit 2)', () => {
    const r = runGuard('uip solution publish MyPackage.zip', { UIPATH_CURRENT_TENANT: 'Prod' });
    assert.equal(r.exitCode, 2);
    assert.ok(r.stderr.includes('Blocked'));
  });

  it('blocks uip solution deploy run on Prod (exit 2)', () => {
    const r = runGuard('uip solution deploy run --parent-folder-path Shared', { UIPATH_CURRENT_TENANT: 'Prod' });
    assert.equal(r.exitCode, 2);
    assert.ok(r.stderr.includes('Blocked'));
  });

  it('blocks uip solution deploy activate on Prod (exit 2)', () => {
    const r = runGuard('uip solution deploy activate MyDeployment', { UIPATH_CURRENT_TENANT: 'Prod' });
    assert.equal(r.exitCode, 2);
    assert.ok(r.stderr.includes('Blocked'));
  });

  it('blocks uip or processes rollback on Prod (exit 2)', () => {
    const r = runGuard('uip or processes rollback my-proc-key --folder-path Shared', { UIPATH_CURRENT_TENANT: 'Prod' });
    assert.equal(r.exitCode, 2);
    assert.ok(r.stderr.includes('Blocked'));
  });
});

describe('safety-guard: MUTATING uip commands on non-prod', () => {
  it('allows uip solution publish on Dev (exit 0, warning)', () => {
    const r = runGuard('uip solution publish MyPackage.zip', { UIPATH_CURRENT_TENANT: 'Dev' });
    assert.equal(r.exitCode, 0);
    assert.ok(r.stderr.includes('MUTATING'));
  });

  it('allows uip solution deploy run on Test (exit 0, warning)', () => {
    const r = runGuard('uip solution deploy run --parent-folder-path Shared', { UIPATH_CURRENT_TENANT: 'Test' });
    assert.equal(r.exitCode, 0);
    assert.ok(r.stderr.includes('MUTATING'));
  });
});

describe('safety-guard: OMU_ALLOW_PROD_MUTATIONS bypass', () => {
  it('allows MUTATING on Prod with OMU_ALLOW_PROD_MUTATIONS=1 (exit 0)', () => {
    const r = runGuard('uip solution publish MyPackage.zip', {
      UIPATH_CURRENT_TENANT: 'Prod',
      OMU_ALLOW_PROD_MUTATIONS: '1',
    });
    assert.equal(r.exitCode, 0);
    assert.ok(r.stderr.includes('allowed'));
  });
});