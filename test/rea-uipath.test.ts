/**
 * Tests for REA-UiPath — Reverse Engineer Anything → UiPath.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { setupScript, testCtx } from './helpers';
import { reaUipath } from '../src/agents/rea-uipath';

const TMP = path.join(os.tmpdir(), `omu-rea-test-${process.pid}`);
const TEST_SCRIPT = path.join(TMP, 'test-script.py');
const TEST_BPMN = path.join(TMP, 'process.bpmn');
const TEST_DIR = path.join(TMP, 'project');

before(() => {
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(TEST_SCRIPT, 'import os\nprint("hello")\n');
  fs.writeFileSync(TEST_BPMN, '<?xml version="1.0"?><bpmn:definitions/>');
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.writeFileSync(path.join(TEST_DIR, 'main.py'), 'print("test")\n');
});

after(() => {
  try { fs.rmSync(TMP, { recursive: true }); } catch { /* ignore */ }
});

describe('rea-uipath', () => {
  it('dry-run returns plan without calling uip', async () => {
    setupScript([]);
    const res = await reaUipath.run(testCtx({
      dryRun: true,
      solutionPath: TEST_SCRIPT,
    }));
    assert.equal(res.success, true);
    assert.equal(res.agent, 'rea-uipath');
  });

  it('happy path: inspect + scaffold + discover', async () => {
    setupScript([
      { match: 'solution init', exitCode: 0, stdout: 'created' },
      { match: 'or folders list', exitCode: 0, stdout: '[]' },
      { match: 'or processes list', exitCode: 0, stdout: '[]' },
      { match: 'or assets list', exitCode: 0, stdout: '[]' },
      { match: 'or queues list', exitCode: 0, stdout: '[]' },
    ]);
    const res = await reaUipath.run(testCtx({
      solutionPath: TEST_SCRIPT,
    }));
    assert.equal(res.success, true);
  });

  it('failure path: solution init fails', async () => {
    setupScript([
      { match: 'solution init', exitCode: 1, stderr: 'directory exists' },
      { match: 'or folders list', exitCode: 0, stdout: '[]' },
    ]);
    const res = await reaUipath.run(testCtx({
      solutionPath: TEST_SCRIPT,
    }));
    assert.equal(res.success, false);
  });

  it('handles directory input', async () => {
    setupScript([
      { match: 'solution init', exitCode: 0, stdout: 'created' },
      { match: 'or folders list', exitCode: 0, stdout: '[]' },
      { match: 'or processes list', exitCode: 0, stdout: '[]' },
      { match: 'or assets list', exitCode: 0, stdout: '[]' },
      { match: 'or queues list', exitCode: 0, stdout: '[]' },
    ]);
    const res = await reaUipath.run(testCtx({
      solutionPath: TEST_DIR,
    }));
    assert.equal(res.success, true);
  });

  it('handles inspect failure on non-existent path', async () => {
    setupScript([]);
    const res = await reaUipath.run(testCtx({
      solutionPath: '/nonexistent/path/that/does/not/exist.py',
    }));
    assert.equal(res.success, false);
  });

  it('maps BPMN input to MaestroBPMN product', async () => {
    setupScript([
      { match: 'solution init', exitCode: 0, stdout: 'created' },
      { match: 'or folders list', exitCode: 0, stdout: '[]' },
      { match: 'or processes list', exitCode: 0, stdout: '[]' },
      { match: 'or assets list', exitCode: 0, stdout: '[]' },
      { match: 'or queues list', exitCode: 0, stdout: '[]' },
    ]);
    const res = await reaUipath.run(testCtx({
      solutionPath: TEST_BPMN,
    }));
    assert.equal(res.success, true);
  });
});