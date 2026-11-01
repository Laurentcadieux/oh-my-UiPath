/**
 * Tests for the Phase 3 engine: DAG builder, mutation lock, cancellation,
 * parallel execution, tenant snapshot.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupScript, testCtx } from './helpers';
import { buildAutopilotDag, topologicalSort, getDependents, formatDag, formatBatches } from '../src/engine/task-graph';
import { acquireLock, resetLocks, lockKey } from '../src/engine/mutation-lock';
import { runParallel } from '../src/engine/worker-pool';
import { clearSnapshotCache, getCachedSnapshot, setCachedSnapshot } from '../src/engine/types';

describe('buildAutopilotDag', () => {
  it('builds a 4-task DAG for the autopilot pipeline', () => {
    const dag = buildAutopilotDag(testCtx());
    assert.equal(dag.length, 4);
    assert.equal(dag[0].id, 'plan');
    assert.equal(dag[1].id, 'review');
    assert.equal(dag[2].id, 'deploy');
    assert.equal(dag[3].id, 'test');
  });

  it('plan has no deps', () => {
    const dag = buildAutopilotDag(testCtx());
    assert.deepEqual(dag[0].deps, []);
  });

  it('review depends on plan', () => {
    const dag = buildAutopilotDag(testCtx());
    assert.deepEqual(dag[1].deps, ['plan']);
  });

  it('deploy depends on review', () => {
    const dag = buildAutopilotDag(testCtx());
    assert.deepEqual(dag[2].deps, ['review']);
  });

  it('test depends on deploy', () => {
    const dag = buildAutopilotDag(testCtx());
    assert.deepEqual(dag[3].deps, ['deploy']);
  });

  it('deploy is MUTATING', () => {
    const dag = buildAutopilotDag(testCtx());
    assert.equal(dag[2].mutation, 'MUTATING');
  });

  it('plan, review, and test are READ_ONLY', () => {
    const dag = buildAutopilotDag(testCtx());
    assert.equal(dag[0].mutation, 'READ_ONLY');
    assert.equal(dag[1].mutation, 'READ_ONLY');
    assert.equal(dag[3].mutation, 'READ_ONLY');
  });

  it('has no AUTHORING stage (artifact-authoring agents were removed)', () => {
    const dag = buildAutopilotDag(testCtx());
    assert.equal(dag.every((t) => t.mutation !== 'AUTHORING'), true);
  });

  it('formatDag produces a readable string', () => {
    const dag = buildAutopilotDag(testCtx());
    const str = formatDag(dag);
    assert.ok(str.includes('DAG (4 tasks):'));
    assert.ok(str.includes('plan'));
    assert.ok(str.includes('review'));
    assert.ok(str.includes('deploy'));
    assert.ok(str.includes('test'));
  });

  it('formatBatches produces readable batches', () => {
    const dag = buildAutopilotDag(testCtx());
    const str = formatBatches(dag, 4);
    assert.ok(str.includes('Parallel batches'));
    assert.ok(str.includes('concurrency=4'));
  });
});

describe('topologicalSort', () => {
  it('sorts tasks in dependency order', () => {
    const dag = buildAutopilotDag(testCtx());
    const sorted = topologicalSort(dag);
    assert.equal(sorted[0].id, 'plan');
    assert.equal(sorted[sorted.length - 1].id, 'test');
  });
});

describe('getDependents', () => {
  it('returns all transitive dependents of plan', () => {
    const dag = buildAutopilotDag(testCtx());
    const deps = getDependents(dag, 'plan');
    assert.ok(deps.has('review'));
    assert.ok(deps.has('deploy'));
    assert.ok(deps.has('test'));
  });

  it('returns only test as dependent of deploy', () => {
    const dag = buildAutopilotDag(testCtx());
    const deps = getDependents(dag, 'deploy');
    assert.ok(deps.has('test'));
    assert.ok(!deps.has('plan'));
    assert.ok(!deps.has('review'));
  });
});

describe('mutation lock', () => {
  beforeEach(() => {
    resetLocks();
  });

  it('acquires and releases a lock', async () => {
    const key = lockKey('Prod', 'Shared');
    const token = await acquireLock(key);
    assert.ok(token);
    token.release();
  });

  it('serializes two concurrent acquires on the same key', async () => {
    resetLocks();
    const key = lockKey('Prod', 'Shared');
    const order: string[] = [];

    const token1 = await acquireLock(key);
    order.push('acquired-1');

    const p2 = acquireLock(key).then((t) => {
      order.push('acquired-2');
      t.release();
    });

    // token2 should not have resolved yet — it's queued.
    assert.equal(order.length, 1);

    token1.release();
    await p2;

    assert.deepEqual(order, ['acquired-1', 'acquired-2']);
  });

  it('allows concurrent acquires on different keys', async () => {
    resetLocks();
    const t1 = await acquireLock(lockKey('Prod', 'FolderA'));
    const t2 = await acquireLock(lockKey('Prod', 'FolderB'));
    assert.ok(t1);
    assert.ok(t2);
    t1.release();
    t2.release();
  });
});

describe('runParallel (fail-fast cancellation)', () => {
  beforeEach(() => {
    // Script every uip call the 4-stage pipeline makes, all succeeding.
    // quality-gate needs a Successful deployment to pass.
    setupScript([
      { match: 'or folders list', exitCode: 0, stdout: '[]' },
      { match: 'rpa validate', exitCode: 0, stdout: '{"Errors":0,"Warnings":0}' },
      { match: 'rpa build', exitCode: 0, stdout: '{"Errors":0,"Warnings":0}' },
      { match: 'maestro case validate', exitCode: 0, stdout: '{"Errors":0}' },
      { match: 'or processes list', exitCode: 0, stdout: '{"Data":[]}' },
      { match: 'solution publish', exitCode: 0, stdout: 'published' },
      { match: 'solution deploy run', exitCode: 0, stdout: 'deployed' },
      {
        match: 'solution deploy list',
        exitCode: 0,
        stdout: JSON.stringify({ Data: [{ Name: 'dep-1', OperationStatus: 'Successful' }] }),
      },
    ]);
    resetLocks();
  });

  it('runs all tasks to completion when all succeed', async () => {
    const dag = buildAutopilotDag(testCtx());
    const results = await runParallel(dag, testCtx(), 4);
    assert.equal(results.length, 4);
    const allOk = results.every((r) => r.status === 'ok');
    assert.ok(allOk, `Expected all OK, got: ${results.map((r) => `${r.taskId}=${r.status}`).join(', ')}`);
  });

  it('cancels dependents when a task fails', async () => {
    // Make plan fail — everything else should be cancelled.
    setupScript([
      { match: 'or folders list', exitCode: 1, stderr: 'auth required' },
    ]);
    resetLocks();

    const dag = buildAutopilotDag(testCtx());
    const results = await runParallel(dag, testCtx(), 4);

    const plan = results.find((r) => r.taskId === 'plan');
    assert.equal(plan?.status, 'failed');

    // review, deploy, test should all be cancelled.
    const cancelled = results.filter((r) => r.status === 'cancelled');
    assert.ok(cancelled.length >= 3, `Expected ≥3 cancelled, got ${cancelled.length}`);
  });
});

describe('tenant snapshot cache', () => {
  beforeEach(() => {
    clearSnapshotCache();
  });

  it('returns undefined when cache is empty', () => {
    assert.equal(getCachedSnapshot(60000), undefined);
  });

  it('caches and retrieves a snapshot', () => {
    const snap = { folders: [], assets: [], queues: [], processes: [], fetchedAt: Date.now() };
    setCachedSnapshot(snap, 60000);
    const cached = getCachedSnapshot(60000);
    assert.ok(cached);
    assert.deepEqual(cached, snap);
  });

  it('returns undefined after TTL expires', async () => {
    const snap = { folders: [], assets: [], queues: [], processes: [], fetchedAt: 0 };
    setCachedSnapshot(snap, 1); // 1ms TTL
    // Wait 2ms so it expires.
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(getCachedSnapshot(60000), undefined);
  });
});