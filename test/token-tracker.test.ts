/**
 * Tests for the token tracker (UiPath-Coding-Agent-ROI).
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateTokens,
  recordTokens,
  trackTokens,
  resetTokenTracker,
  getTrackedRecords,
  buildTokenReport,
  formatTokenReport,
} from '../src/token-tracker';

describe('estimateTokens', () => {
  it('estimates tokens from string length', () => {
    assert.ok(estimateTokens('hello world') > 0);
    assert.equal(estimateTokens(''), 0);
  });

  it('approximates 4 chars per token', () => {
    const tokens = estimateTokens('aaaa'); // 4 chars
    assert.equal(tokens, 1);
  });
});

describe('recordTokens', () => {
  it('creates a token record with agent, stage, and token counts', () => {
    const r = recordTokens('orchestrator', 'plan', 'some output text', 100);
    assert.equal(r.agent, 'orchestrator');
    assert.equal(r.stage, 'plan');
    assert.ok(r.inputTokens > 0);
    assert.ok(r.outputTokens > 0);
    assert.equal(r.totalTokens, r.inputTokens + r.outputTokens);
    assert.equal(r.durationMs, 100);
  });
});

describe('token tracker', () => {
  beforeEach(() => {
    resetTokenTracker();
  });

  it('tracks and retrieves records', () => {
    trackTokens(recordTokens('orchestrator', 'plan', 'output1', 50));
    trackTokens(recordTokens('reviewer', 'review', 'output2', 100));
    const records = getTrackedRecords();
    assert.equal(records.length, 2);
  });

  it('resets on resetTokenTracker', () => {
    trackTokens(recordTokens('orchestrator', 'plan', 'output', 50));
    resetTokenTracker();
    assert.equal(getTrackedRecords().length, 0);
  });

  it('builds a report with per-agent breakdown', () => {
    trackTokens(recordTokens('orchestrator', 'plan', 'aaaa', 50));
    trackTokens(recordTokens('reviewer', 'review', 'bbbbbbbb', 100));
    trackTokens(recordTokens('reviewer', 'review', 'cccc', 30));

    const report = buildTokenReport();
    assert.equal(report.recordCount, 3);
    assert.ok(report.totalTokens > 0);

    // Per-agent: orchestrator has 1 call, reviewer has 2
    const orch = report.perAgent.find((a) => a.agent === 'orchestrator');
    assert.ok(orch);
    assert.equal(orch.calls, 1);

    const rev = report.perAgent.find((a) => a.agent === 'reviewer');
    assert.ok(rev);
    assert.equal(rev.calls, 2);
    assert.ok(rev.totalTokens > orch.totalTokens); // reviewer had more output
  });

  it('builds a report with per-stage breakdown', () => {
    trackTokens(recordTokens('orchestrator', 'plan', 'aaaa', 50));
    trackTokens(recordTokens('reviewer', 'review', 'bbbbbbbb', 100));
    trackTokens(recordTokens('deployment-manager', 'deploy', 'cccccc', 200));

    const report = buildTokenReport();
    assert.equal(report.perStage.length, 3);
    assert.ok(report.perStage.some((s) => s.stage === 'plan'));
    assert.ok(report.perStage.some((s) => s.stage === 'review'));
    assert.ok(report.perStage.some((s) => s.stage === 'deploy'));
  });

  it('formats a readable report', () => {
    trackTokens(recordTokens('orchestrator', 'plan', 'some output', 50));
    const report = buildTokenReport();
    const text = formatTokenReport(report);
    assert.ok(text.includes('Token Usage Report'));
    assert.ok(text.includes('Total tokens:'));
    assert.ok(text.includes('Per Agent:'));
    assert.ok(text.includes('Per Stage:'));
  });

  it('handles empty records', () => {
    resetTokenTracker();
    const report = buildTokenReport();
    assert.equal(report.recordCount, 0);
    assert.equal(report.totalTokens, 0);
    assert.equal(report.perAgent.length, 0);
  });
});