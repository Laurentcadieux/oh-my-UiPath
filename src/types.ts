/**
 * Shared TypeScript types for oh-my-UiPath.
 *
 * The orchestration model is: intent -> agent -> skill -> `uip` command.
 * These types describe agents, workflows, skills, and the execution context
 * that flows through the pipeline.
 */

/** Execution context passed to every agent and workflow run. */
export interface AgentContext {
  /** Working directory the `uip` CLI runs in. */
  readonly cwd: string;
  /** Path to a Solution Design Document (SDD), if one is in play. */
  readonly sddPath?: string;
  /** Path to the `.uipx` solution or solution root, if known. */
  readonly solutionPath?: string;
  /** Target tenant name. */
  readonly tenant?: string;
  /** Target Orchestrator folder. */
  readonly folder?: string;
  /** When true, agents print the `uip` calls they *would* run but do not execute. */
  readonly dryRun: boolean;
  /** When true, agents print full `uip` stdout/stderr. */
  readonly verbose: boolean;
  /** Free-form labels the orchestrator attaches to the run. */
  readonly labels?: Record<string, string>;
  /** Task list derived from the SDD by the upstream uipath-planner. */
  readonly taskList?: string;
  /** When true, allow Preview/In-development skills against prod environments. */
  readonly allowPreview?: boolean;
  /** Skill status map loaded from upstream assets/skill-status.json. */
  readonly skillStatusMap?: SkillStatusMap;
}

/** Status of a skill from the upstream catalog. */
export type SkillStatus = 'stable' | 'preview' | 'in-development' | 'unknown';

/** Map of skill name → status, loaded from upstream. */
export type SkillStatusMap = Record<string, SkillStatus>;

/** Structured review finding from the reviewer agent. */
export interface ReviewFinding {
  readonly severity: 'Critical' | 'Warning' | 'Info';
  readonly message: string;
  readonly rule?: string;
}

/** Structured result of a single agent run. */
export interface AgentResult {
  /** Name of the agent that produced this result. */
  readonly agent: string;
  /** True only if every underlying `uip` call exited 0. */
  readonly success: boolean;
  /** Human-readable transcript of the `uip` calls and their output. */
  readonly output: string;
  /** File paths produced or modified by the run (best-effort). */
  readonly artifacts: readonly string[];
  /** Wall-clock duration of the run in milliseconds. */
  readonly durationMs: number;
  /** Optional structured exit codes per `uip` call, in order. */
  readonly exitCodes?: readonly number[];
}

/** Function executed by an agent. */
export type AgentRunFn = (ctx: AgentContext) => Promise<AgentResult>;

/** An agent owns a slice of the UiPath platform and a set of `uip` commands. */
export interface Agent {
  /** Stable identifier, e.g. `solution-builder`. */
  readonly name: string;
  /** Human-readable role. */
  readonly role: string;
  /** Names of the UiPath skills this agent loads for context. */
  readonly skills: readonly string[];
  /** `uip` command surfaces this agent drives. */
  readonly commands: readonly string[];
  /** Execute the agent against `ctx`. */
  run: AgentRunFn;
}

/** One step in a workflow — which agent runs and why. */
export interface WorkflowStep {
  readonly name: string;
  readonly agent: string;
  readonly description: string;
}

/** Function executed by a workflow. */
export type WorkflowRunFn = (ctx: AgentContext) => Promise<AgentResult[]>;

/** A workflow chains agents into a pipeline. */
export interface Workflow {
  readonly name: string;
  readonly description: string;
  readonly steps: readonly WorkflowStep[];
  run: WorkflowRunFn;
}

/** A UiPath skill loaded from the catalog. */
export interface Skill {
  readonly name: string;
  readonly description: string;
  /** Absolute path to the skill's `SKILL.md`. */
  readonly path: string;
}

/** A CLI subcommand descriptor (used for help/introspection only). */
export interface CliCommand {
  readonly name: string;
  readonly description: string;
  readonly aliases?: readonly string[];
}
