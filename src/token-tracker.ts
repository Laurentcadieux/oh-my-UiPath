/**
 * Token usage tracker — monitors LLM token consumption during builds,
 * with a breakdown of total and per-agent usage.
 *
 * Named "UiPath-Coding-Agent-ROI" — measures the cost (tokens) of
 * using coding agents to build UiPath automations, so you can
 * calculate the ROI of agent-driven development vs manual work.
 *
 * How it works:
 * - Each agent run is wrapped by the pipeline to record token usage
 * - Tokens are estimated from output size (rough: 1 token ≈ 4 chars)
 * - Records are persisted to .omu-tokens.json in the project folder
 * - `omu-h tokens` prints the report
 * - `omu-h roi` prints the report + cost estimate
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/** A single token usage record for one agent run. */
export interface TokenRecord {
  readonly agent: string;
  readonly stage: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly durationMs: number;
  readonly timestamp: number;
}

/** Aggregated token usage report. */
export interface TokenReport {
  readonly totalInput: number;
  readonly totalOutput: number;
  readonly totalTokens: number;
  readonly perAgent: ReadonlyArray<{
    readonly agent: string;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
    readonly calls: number;
  }>;
  readonly perStage: ReadonlyArray<{
    readonly stage: string;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
    readonly calls: number;
  }>;
  readonly recordCount: number;
}

/** Path to the token store file. */
const TOKENS_FILE = '.omu-tokens.json';

/** In-memory token store (cleared per pipeline run). */
let _records: TokenRecord[] = [];

/** Get the path to the token store file for a given cwd. */
function tokensFilePath(cwd?: string): string {
  return path.join(cwd ?? process.cwd(), TOKENS_FILE);
}

/** Estimate tokens from a string (rough: 1 token ≈ 4 chars). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Record token usage for a single agent run. */
export function recordTokens(
  agent: string,
  stage: string,
  output: string,
  durationMs: number,
): TokenRecord {
  const outputTokens = estimateTokens(output);
  const inputTokens = Math.round(outputTokens * 1.5);
  return {
    agent,
    stage,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    durationMs,
    timestamp: Date.now(),
  };
}

/** Add a token record to the in-memory store. */
export function trackTokens(record: TokenRecord): void {
  _records.push(record);
}

/** Get all tracked records from the in-memory store. */
export function getTrackedRecords(): readonly TokenRecord[] {
  return _records;
}

/** Clear the in-memory store (call at the start of each pipeline run). */
export function resetTokenTracker(): void {
  _records = [];
}

/** Persist the in-memory records to .omu-tokens.json in the given cwd. */
export function persistTokens(cwd?: string): void {
  if (_records.length === 0) return;
  const filePath = tokensFilePath(cwd);
  try {
    fs.writeFileSync(filePath, JSON.stringify(_records, null, 2));
  } catch {
    // ignore write errors
  }
}

/** Load records from .omu-tokens.json in the given cwd. */
export function loadTokens(cwd?: string): TokenRecord[] {
  const filePath = tokensFilePath(cwd);
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as TokenRecord[];
  } catch {
    return [];
  }
}

/** Build a token report from records. */
export function buildTokenReport(records?: readonly TokenRecord[]): TokenReport {
  const r = records ?? _records;
  let totalInput = 0;
  let totalOutput = 0;

  const agentMap = new Map<string, { input: number; output: number; total: number; calls: number }>();
  const stageMap = new Map<string, { input: number; output: number; total: number; calls: number }>();

  for (const rec of r) {
    totalInput += rec.inputTokens;
    totalOutput += rec.outputTokens;

    const a = agentMap.get(rec.agent) ?? { input: 0, output: 0, total: 0, calls: 0 };
    a.input += rec.inputTokens;
    a.output += rec.outputTokens;
    a.total += rec.totalTokens;
    a.calls += 1;
    agentMap.set(rec.agent, a);

    const s = stageMap.get(rec.stage) ?? { input: 0, output: 0, total: 0, calls: 0 };
    s.input += rec.inputTokens;
    s.output += rec.outputTokens;
    s.total += rec.totalTokens;
    s.calls += 1;
    stageMap.set(rec.stage, s);
  }

  const perAgent = [...agentMap.entries()]
    .map(([agent, v]) => ({
      agent,
      inputTokens: v.input,
      outputTokens: v.output,
      totalTokens: v.total,
      calls: v.calls,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);

  const perStage = [...stageMap.entries()]
    .map(([stage, v]) => ({
      stage,
      inputTokens: v.input,
      outputTokens: v.output,
      totalTokens: v.total,
      calls: v.calls,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);

  return {
    totalInput,
    totalOutput,
    totalTokens: totalInput + totalOutput,
    perAgent,
    perStage,
    recordCount: r.length,
  };
}

/** Format a token report as a printable string. */
export function formatTokenReport(report: TokenReport): string {
  const lines: string[] = [];

  lines.push('UiPath-Coding-Agent-ROI — Token Usage Report');
  lines.push('━'.repeat(50));
  lines.push('');
  lines.push(`Total tokens:   ${report.totalTokens.toLocaleString()}`);
  lines.push(`  Input:        ${report.totalInput.toLocaleString()}`);
  lines.push(`  Output:       ${report.totalOutput.toLocaleString()}`);
  lines.push(`  Records:      ${report.recordCount}`);
  lines.push('');
  lines.push('Per Agent:');
  lines.push('  Agent                    Input       Output      Total       Calls');
  lines.push('  ' + '─'.repeat(76));
  for (const a of report.perAgent) {
    lines.push(
      `  ${a.agent.padEnd(24)} ${String(a.inputTokens).padStart(10)}  ${String(a.outputTokens).padStart(10)}  ${String(a.totalTokens).padStart(10)}  ${String(a.calls).padStart(5)}`,
    );
  }
  lines.push('');
  lines.push('Per Stage:');
  lines.push('  Stage                    Input       Output      Total       Calls');
  lines.push('  ' + '─'.repeat(76));
  for (const s of report.perStage) {
    lines.push(
      `  ${s.stage.padEnd(24)} ${String(s.inputTokens).padStart(10)}  ${String(s.outputTokens).padStart(10)}  ${String(s.totalTokens).padStart(10)}  ${String(s.calls).padStart(5)}`,
    );
  }

  return lines.join('\n');
}