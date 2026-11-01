/**
 * Tests for the safety guard PreToolUse hook.
 *
 * Runs hooks/safety-guard.mjs as a subprocess with scripted stdin and
 * checks the exit code + stderr.
 */
import { describe, it } from 'node:test';
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

// ─── Non-uip commands ───────────────────────────────────────────────

describe('safety-guard: non-uip commands', () => {
  it('allows ls (exit 0)', () => {
    const r = runGuard('ls -la');
    assert.equal(r.exitCode, 0);
  });

  it('allows git (exit 0)', () => {
    const r = runGuard('git commit -m "test"');
    assert.equal(r.exitCode, 0);
  });

  it('allows npm (exit 0)', () => {
    const r = runGuard('npm install');
    assert.equal(r.exitCode, 0);
  });

  it('allows empty command (exit 0)', () => {
    const r = runGuard('');
    assert.equal(r.exitCode, 0);
  });

  it('allows commands that contain "uip" as substring (exit 0)', () => {
    const r = runGuard('echo "equivalent"');
    assert.equal(r.exitCode, 0);
  });
});

// ─── READ_ONLY uip commands ─────────────────────────────────────────

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

  it('allows uip solution list (exit 0)', () => {
    const r = runGuard('uip solution list');
    assert.equal(r.exitCode, 0);
  });
});

// ─── AUTHORING uip commands ─────────────────────────────────────────

describe('safety-guard: AUTHORING uip commands', () => {
  it('allows uip solution init (exit 0)', () => {
    const r = runGuard('uip solution init MySolution', { UIPATH_CURRENT_TENANT: 'Prod' });
    assert.equal(r.exitCode, 0);
  });

  it('allows uip solution pack (exit 0)', () => {
    const r = runGuard('uip solution pack MySolution dist', { UIPATH_CURRENT_TENANT: 'Prod' });
    assert.equal(r.exitCode, 0);
  });

  it('allows uip maestro case init (exit 0)', () => {
    const r = runGuard('uip maestro case init MyCase', { UIPATH_CURRENT_TENANT: 'Prod' });
    assert.equal(r.exitCode, 0);
  });
});

// ─── MUTATING on Prod ───────────────────────────────────────────────

describe('safety-guard: MUTATING on Prod (blocks)', () => {
  it('blocks uip solution publish on "Prod" (exit 2)', () => {
    const r = runGuard('uip solution publish MyPackage.zip', { UIPATH_CURRENT_TENANT: 'Prod' });
    assert.equal(r.exitCode, 2);
    assert.ok(r.stderr.includes('Blocked'));
  });

  it('blocks uip solution publish on "Production" (exit 2)', () => {
    const r = runGuard('uip solution publish MyPackage.zip', { UIPATH_CURRENT_TENANT: 'Production' });
    assert.equal(r.exitCode, 2);
    assert.ok(r.stderr.includes('Blocked'));
  });

  it('blocks uip solution publish on "prod-eu" (exit 2)', () => {
    const r = runGuard('uip solution publish MyPackage.zip', { UIPATH_CURRENT_TENANT: 'prod-eu' });
    assert.equal(r.exitCode, 2);
    assert.ok(r.stderr.includes('Blocked'));
  });

  it('blocks uip solution deploy run on Prod (exit 2)', () => {
    const r = runGuard('uip solution deploy run --parent-folder-path Shared', { UIPATH_CURRENT_TENANT: 'Prod' });
    assert.equal(r.exitCode, 2);
  });

  it('blocks uip or processes rollback on Prod (exit 2)', () => {
    const r = runGuard('uip or processes rollback my-key --folder-path Shared', { UIPATH_CURRENT_TENANT: 'Prod' });
    assert.equal(r.exitCode, 2);
  });
});

// ─── MUTATING fail-closed (unknown/empty tenant) ────────────────────

describe('safety-guard: MUTATING fail-closed (unknown tenant)', () => {
  it('blocks on empty tenant (exit 2)', () => {
    const r = runGuard('uip solution publish MyPackage.zip');
    assert.equal(r.exitCode, 2);
    assert.ok(r.stderr.includes('unknown'));
  });

  it('blocks when UIPATH_CURRENT_TENANT is empty string (exit 2)', () => {
    const r = runGuard('uip solution publish MyPackage.zip', { UIPATH_CURRENT_TENANT: '' });
    assert.equal(r.exitCode, 2);
    assert.ok(r.stderr.includes('unknown'));
  });
});

// ─── MUTATING on non-prod ────────────────────────────────────────────

describe('safety-guard: MUTATING on non-prod (allows with warning)', () => {
  it('allows uip solution publish on Dev (exit 0)', () => {
    const r = runGuard('uip solution publish MyPackage.zip', { UIPATH_CURRENT_TENANT: 'Dev' });
    assert.equal(r.exitCode, 0);
    assert.ok(r.stderr.includes('MUTATING'));
  });

  it('allows uip solution deploy run on Test (exit 0)', () => {
    const r = runGuard('uip solution deploy run --parent-folder-path Shared', { UIPATH_CURRENT_TENANT: 'Test' });
    assert.equal(r.exitCode, 0);
  });
});

// ─── Bypass ──────────────────────────────────────────────────────────

describe('safety-guard: OMU_ALLOW_PROD_MUTATIONS bypass', () => {
  it('allows MUTATING on Prod with bypass (exit 0)', () => {
    const r = runGuard('uip solution publish MyPackage.zip', {
      UIPATH_CURRENT_TENANT: 'Prod',
      OMU_ALLOW_PROD_MUTATIONS: '1',
    });
    assert.equal(r.exitCode, 0);
    assert.ok(r.stderr.includes('allowed'));
  });

  it('bypass also works on unknown tenant (exit 0)', () => {
    const r = runGuard('uip solution publish MyPackage.zip', {
      OMU_ALLOW_PROD_MUTATIONS: '1',
    });
    assert.equal(r.exitCode, 0);
  });
});

// ─── Command normalization ──────────────────────────────────────────

describe('safety-guard: command normalization', () => {
  it('handles global flags before subcommand: uip --output json solution publish', () => {
    const r = runGuard('uip --output json solution publish MyPackage.zip', { UIPATH_CURRENT_TENANT: 'Prod' });
    assert.equal(r.exitCode, 2);
    assert.ok(r.stderr.includes('Blocked'));
  });

  it('handles chained: cd x && uip solution deploy run', () => {
    const r = runGuard('cd /tmp && uip solution deploy run --parent-folder-path Shared', { UIPATH_CURRENT_TENANT: 'Prod' });
    assert.equal(r.exitCode, 2);
  });

  it('handles chained with semicolon: echo ok ; uip solution publish', () => {
    const r = runGuard('echo ok ; uip solution publish MyPackage.zip', { UIPATH_CURRENT_TENANT: 'Prod' });
    assert.equal(r.exitCode, 2);
  });

  it('handles npx uip: npx uip solution publish', () => {
    const r = runGuard('npx uip solution publish MyPackage.zip', { UIPATH_CURRENT_TENANT: 'Prod' });
    assert.equal(r.exitCode, 2);
  });

  it('handles absolute path: /usr/local/bin/uip solution publish', () => {
    const r = runGuard('/usr/local/bin/uip solution publish MyPackage.zip', { UIPATH_CURRENT_TENANT: 'Prod' });
    assert.equal(r.exitCode, 2);
  });

  it('allows read-only in a chain: ls && uip or folders list', () => {
    const r = runGuard('ls -la && uip or folders list --output json', { UIPATH_CURRENT_TENANT: 'Prod' });
    assert.equal(r.exitCode, 0);
  });

  it('blocks if any segment in a chain is mutating', () => {
    const r = runGuard('uip or folders list && uip solution publish MyPackage.zip', { UIPATH_CURRENT_TENANT: 'Prod' });
    assert.equal(r.exitCode, 2);
  });
});

// ─── Skill maturity gate ─────────────────────────────────────────────

describe('safety-guard: skill maturity gate (Phase 2)', () => {
  it('blocks Preview skill on Prod even with prod bypass (exit 2)', () => {
    // maestro case publish → uipath-maestro-case (Preview)
    const r = runGuard('uip maestro case publish MyPackage', {
      UIPATH_CURRENT_TENANT: 'Prod',
      OMU_ALLOW_PROD_MUTATIONS: '1',
    });
    assert.equal(r.exitCode, 2);
    assert.ok(r.stderr.includes('preview') || r.stderr.includes('Preview'));
  });

  it('allows Preview skill on Prod with both bypasses (exit 0)', () => {
    const r = runGuard('uip maestro case publish MyPackage', {
      UIPATH_CURRENT_TENANT: 'Prod',
      OMU_ALLOW_PROD_MUTATIONS: '1',
      OMU_ALLOW_PREVIEW: '1',
    });
    assert.equal(r.exitCode, 0);
  });

  it('allows Stable skill on Prod with prod bypass only (exit 0)', () => {
    // solution publish → uipath-solution (Stable)
    const r = runGuard('uip solution publish MyPackage.zip', {
      UIPATH_CURRENT_TENANT: 'Prod',
      OMU_ALLOW_PROD_MUTATIONS: '1',
    });
    assert.equal(r.exitCode, 0);
  });

  it('blocks In-development skill on Prod even with prod bypass (exit 2)', () => {
    // maestro bpmn publish → uipath-maestro-bpmn (In-development)
    const r = runGuard('uip maestro bpmn publish MyBpmn', {
      UIPATH_CURRENT_TENANT: 'Prod',
      OMU_ALLOW_PROD_MUTATIONS: '1',
    });
    assert.equal(r.exitCode, 2);
  });

  it('skill maturity gate does not apply on non-prod (exit 0)', () => {
    const r = runGuard('uip maestro case publish MyPackage', {
      UIPATH_CURRENT_TENANT: 'Dev',
    });
    assert.equal(r.exitCode, 0);
  });
});

describe('safety-guard: configurable prod pattern', () => {
  it('respects OMU_PROD_TENANT_PATTERN env', () => {
    // Custom pattern: only "staging" is treated as prod
    const r = runGuard('uip solution publish MyPackage.zip', {
      UIPATH_CURRENT_TENANT: 'Prod',
      OMU_PROD_TENANT_PATTERN: '^staging$',
    });
    assert.equal(r.exitCode, 0); // "Prod" doesn't match ^staging$ → allowed
    assert.ok(r.stderr.includes('MUTATING'));
  });

  it('blocks when tenant matches custom pattern', () => {
    const r = runGuard('uip solution publish MyPackage.zip', {
      UIPATH_CURRENT_TENANT: 'staging',
      OMU_PROD_TENANT_PATTERN: '^staging$',
    });
    assert.equal(r.exitCode, 2);
  });
});