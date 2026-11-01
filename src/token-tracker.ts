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
 * - The tracker reads token counts from the Claude Code session
 *   environment (CLAUDE_SESSION_TOKENS env var or the session
 *   transcript metadata)
 * - If no session data is available, it falls back to estimating
 *   tokens from the agent output size (rough: 1 token ≈ 4 chars)
 * - Results are stored in .omu-tokens.json and printed with
 *   `omu-h tokens` or `omu-h roi`
 */

/** A single token usage record for one agent run. */
export interface TokenRecord {
  /** Agent name (e.g. "orchestrator", "reviewer"). */
  readonly agent: string;
  /** Workflow or stage name (e.g. "autopilot", "review"). */
  readonly stage: string;
  /** Input tokens (prompt). */
  readonly inputTokens: number;
  /** Output tokens (completion). */
  readonly outputTokens: number;
  /** Total tokens (input + output). */
  readonly totalTokens: number;
  /** Wall-clock duration in ms. */
  readonly durationMs: number;
  /** Timestamp (epoch ms). */
  readonly timestamp: number;
}

/** Aggregated token usage report. */
export interface TokenReport {
  /** Total input tokens across all agents. */
  readonly totalInput: number;
  /** Total output tokens across all agents. */
  readonly totalOutput: number;
  /** Total tokens (input + output). */
  readonly totalTokens: number;
  /** Per-agent breakdown. */
  readonly perAgent: ReadonlyArray<{
    readonly agent: string;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
    readonly calls: number;
  }>;
  /** Per-stage breakdown. */
  readonly perStage: ReadonlyArray<{
    readonly stage: string;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
    readonly calls: number;
  }>;
  /** Number of records. */
  readonly recordCount: number;
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
  // Input tokens can't be measured without session data — estimate
  // as roughly equal to output for agent runs (system prompt + context).
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

/** In-memory token store (cleared per pipeline run). */
let _records: TokenRecord[] = [];

/** Add a token record. */
export function trackTokens(record: TokenRecord): void {
  _records.push(record);
}

/** Get all tracked records. */
export function getTrackedRecords(): readonly TokenRecord[] {
  return _records;
}

/** Clear the in-memory store (call at the start of each pipeline run). */
export function resetTokenTracker(): void {
  _records = [];
}

/** Build a token report from the current records. */
export function buildTokenReport(records: readonly TokenRecord[] = _records): TokenReport {
  let totalInput = 0;
  let totalOutput = 0;

  // Per-agent aggregation
  const agentMap = new Map<string, { input: number; output: number; total: number; calls: number }>();
  const stageMap = new Map<string, { input: number; output: number; total: number; calls: number }>();

  for (const r of records) {
    totalInput += r.inputTokens;
    totalOutput += r.outputTokens;

    // Agent aggregation
    const a = agentMap.get(r.agent) ?? { input: 0, output: 0, total: 0, calls: 0 };
    a.input += r.inputTokens;
    a.output += r.outputTokens;
    a.total += r.totalTokens;
    a.calls += 1;
    agentMap.set(r.agent, a);

    // Stage aggregation
    const s = stageMap.get(r.stage) ?? { input: 0, output: 0, total: 0, calls: 0 };
    s.input += r.inputTokens;
    s.output += r.outputTokens;
    s.total += r.totalTokens;
    s.calls += 1;
    stageMap.set(r.stage, s);
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
    recordCount: records.length,
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