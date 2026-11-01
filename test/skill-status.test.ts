/**
 * Tests for skill-status module.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isSkillAllowed } from '../src/skill-status';
import type { SkillStatusMap } from '../src/types';

const testMap: SkillStatusMap = {
  'uipath-planner': 'stable',
  'uipath-troubleshoot': 'preview',
  'uipath-maestro-bpmn': 'in-development',
  'uipath-unknown-skill': 'unknown',
};

describe('isSkillAllowed', () => {
  it('allows stable skills on any environment', () => {
    const r = isSkillAllowed('uipath-planner', 'prod', false, testMap);
    assert.equal(r.allowed, true);
  });

  it('allows stable skills on non-prod', () => {
    const r = isSkillAllowed('uipath-planner', 'dev', false, testMap);
    assert.equal(r.allowed, true);
  });

  it('allows preview skills on non-prod without --allow-preview', () => {
    const r = isSkillAllowed('uipath-troubleshoot', 'dev', false, testMap);
    assert.equal(r.allowed, true);
    assert.ok(r.reason?.includes('preview'));
  });

  it('refuses preview skills on prod without --allow-preview', () => {
    const r = isSkillAllowed('uipath-troubleshoot', 'prod', false, testMap);
    assert.equal(r.allowed, false);
    assert.ok(r.reason?.includes('--allow-preview'));
  });

  it('allows preview skills on prod WITH --allow-preview', () => {
    const r = isSkillAllowed('uipath-troubleshoot', 'prod', true, testMap);
    assert.equal(r.allowed, true);
  });

  it('refuses in-development skills on prod without --allow-preview', () => {
    const r = isSkillAllowed('uipath-maestro-bpmn', 'prod', false, testMap);
    assert.equal(r.allowed, false);
    assert.ok(r.reason?.includes('--allow-preview'));
  });

  it('blocks unknown skills on prod (fail-closed)', () => {
    const r = isSkillAllowed('uipath-unknown-skill', 'prod', false, testMap);
    assert.equal(r.allowed, false);
  });

  it('allows unknown skills on non-prod', () => {
    const r = isSkillAllowed('uipath-unknown-skill', 'dev', false, testMap);
    assert.equal(r.allowed, true);
  });

  it('treats Prod (capital) the same as prod', () => {
    const r = isSkillAllowed('uipath-troubleshoot', 'Prod', false, testMap);
    assert.equal(r.allowed, false);
  });

  it('treats Production the same as prod', () => {
    const r = isSkillAllowed('uipath-troubleshoot', 'Production', false, testMap);
    assert.equal(r.allowed, false);
  });
});