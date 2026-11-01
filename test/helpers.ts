/**
 * Test helpers: build an AgentContext pointed at a fake uip binary.
 */
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import type { AgentContext } from '../src/types';

// fake-uip.js lives in the source test/ dir, not dist/test/ (tsc doesn't copy .js)
const FAKE_UIP = path.resolve(__dirname, '..', '..', 'test', 'fake-uip.js');
const TMP = os.tmpdir();
// Unique per process to avoid races between parallel test files
const SCRIPT_PATH = path.join(TMP, `omu-uip-script-${process.pid}.json`);
const LOG_PATH = path.join(TMP, `omu-uip-calls-${process.pid}.log`);

/** Write a fresh uip-script.json and clear the call log. */
export function setupScript(script: unknown[]): void {
  // Point runUip at our fake binary
  process.env.OMU_UIP_BIN = FAKE_UIP;
  process.env.OMU_UIP_SCRIPT = SCRIPT_PATH;
  process.env.OMU_UIP_LOG = LOG_PATH;
  fs.writeFileSync(SCRIPT_PATH, JSON.stringify(script, null, 2));
  try { fs.writeFileSync(LOG_PATH, ''); } catch (_) { /* ignore */ }
}

/** Read the call log as an array of lines. */
export function readCalls(): string[] {
  try {
    return fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/** Build a context that uses the fake uip binary. */
export function testCtx(opts: Partial<AgentContext> = {}): AgentContext {
  return {
    cwd: opts.cwd ?? TMP,
    sddPath: opts.sddPath,
    solutionPath: opts.solutionPath,
    tenant: opts.tenant ?? 'TestTenant',
    folder: opts.folder ?? 'Shared',
    dryRun: opts.dryRun ?? false,
    verbose: opts.verbose ?? false,
    labels: opts.labels,
  };
}

export { FAKE_UIP, SCRIPT_PATH };