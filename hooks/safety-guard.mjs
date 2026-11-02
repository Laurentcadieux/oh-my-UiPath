#!/usr/bin/env node
/**
 * safety-guard.mjs — PreToolUse hook for oh-my-UiPath.
 *
 * Intercepts Bash commands that invoke the `uip` CLI and applies safety
 * rules:
 *
 *  - Non-uip commands: pass through (exit 0).
 *  - READ_ONLY uip commands (list, get, status, validate, search): pass.
 *  - AUTHORING uip commands (init, restore, pack, projects add/remove,
 *    resources refresh, case init/pack): pass.
 *  - MUTATING uip commands: **blocked when the active tenant is Prod or
 *    unknown** (exit 2) unless `OMU_ALLOW_PROD_MUTATIONS=1` is set.
 *  - On non-prod known tenants: pass with a warning to stderr.
 *
 * Prod detection:
 *  - env `OMU_PROD_TENANT_PATTERN` (a regex string), default: ^(prod|production)([-_].*)?$
 *  - Optional `.omu.json` in project root or home: { "prodTenantPattern": "..." }
 *
 * Fail-closed: if the tenant is empty or unknown, MUTATING commands are
 * blocked. The user must set `UIPATH_CURRENT_TENANT` (or `OMU_TENANT`)
 * to a non-prod value, or set `OMU_ALLOW_PROD_MUTATIONS=1`.
 *
 * Command normalization:
 *  - Strips global flags placed before the subcommand
 *    (e.g. `uip --output json solution publish` → `uip solution publish`).
 *  - Handles chained commands (&&, ;, |) — each segment is checked.
 *  - Handles `npx uip`, `npx @uipath/cli`, absolute paths to the uip binary.
 *
 * Input (stdin JSON): { "tool_name": "Bash", "tool_input": { "command": "..." } }
 * Exit 0 = allow, exit 2 = block (stderr shown to user).
 *
 * No network calls. Runs in < 5 seconds (string matching only).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

// ─── Config ───────────────────────────────────────────────────────────

/** Load .omu.json from project root or home directory. */
function loadOmuConfig() {
  const candidates = [
    join(process.cwd(), ".omu.json"),
    join(homedir(), ".omu.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf8"));
      } catch {
        // ignore parse errors
      }
    }
  }
  return {};
}

const omuConfig = loadOmuConfig();

/** Prod tenant pattern (regex). */
const PROD_PATTERN_STR =
  process.env.OMU_PROD_TENANT_PATTERN ??
  omuConfig.prodTenantPattern ??
  "(prod|prd|production)";
const PROD_RE = new RegExp(PROD_PATTERN_STR, "i");

/** Bypass flag for all prod mutations. */
const ALLOW_PROD = process.env.OMU_ALLOW_PROD_MUTATIONS === "1";

/** Bypass flag for Preview/In-development skills on prod. */
const ALLOW_PREVIEW = process.env.OMU_ALLOW_PREVIEW === "1";

// ─── Skill maturity ──────────────────────────────────────────────────

/** Map uip subcommand prefix → skill name (from the upstream skill catalog). */
const SUBCMD_TO_SKILL = {
  "solution": "uipath-solution",
  "or": "uipath-platform",
  "maestro case": "uipath-maestro-case",
  "maestro bpmn": "uipath-maestro-bpmn",
  "maestro flow": "uipath-maestro-flow",
  "rpa": "uipath-rpa",
  "codedapp": "uipath-coded-apps",
  "codedagent": "uipath-agents",
  "function": "uipath-functions",
  "ixp": "uipath-ixp",
  "is": "uipath-connector-builder",
  "agenthub": "uipath-mcp-servers",
  "admin": "uipath-admin",
  "aops": "uipath-aops",
  "gov": "uipath-governance",
  "insights": "uipath-insights",
  "pm": "uipath-process-mining",
};

/** Map a uip subcommand string to its skill name. */
function subcmdToSkill(subcmd) {
  for (const [prefix, skill] of Object.entries(SUBCMD_TO_SKILL)) {
    if (subcmd.startsWith(prefix)) return skill;
  }
  return undefined;
}

/** Load skill-status.json from the plugin root, skills root, or bundled assets. */
function loadSkillStatuses() {
  const candidates = [
    process.env.CLAUDE_PLUGIN_ROOT
      ? join(process.env.CLAUDE_PLUGIN_ROOT, "assets", "skill-status.json")
      : null,
    join(homedir(), ".agents", "skills", "assets", "skill-status.json"),
    join(process.cwd(), "assets", "skill-status.json"),
  ].filter(Boolean);

  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, "utf8");
        const data = JSON.parse(raw);
        return data?.skills ?? {};
      } catch {
        // ignore parse errors
      }
    }
  }
  return {};
}

const skillStatuses = loadSkillStatuses();

/** Get the status of a skill: 'stable' | 'preview' | 'in-development' | 'unknown'. */
function getSkillStatus(skillName) {
  if (!skillName) return "unknown";
  const entry = skillStatuses[skillName];
  if (!entry) return "unknown";
  return entry.status ?? "unknown";
}

// ─── Command normalization ────────────────────────────────────────────

/**
 * Extract all `uip ...` invocations from a Bash command string.
 *
 * Handles:
 * - Global flags before the subcommand: `uip --output json solution publish`
 *   → extracted as `uip solution publish`
 * - Chained commands: `cmd1 && uip ... ; cmd2 | uip ...`
 *   → each uip segment extracted separately
 * - `npx uip`, `npx @uipath/cli`: stripped to `uip`
 * - Absolute paths: `/usr/local/bin/uip solution publish` → `uip solution publish`
 *
 * Returns an array of normalized uip command strings (without the leading
 * `uip` token). Empty array if no uip invocation found.
 */
function extractUipCommands(bashCmd) {
  // Split on chain operators: && ; | (but not ||)
  // Also handle subshells: ( ... ) or $( ... )
  const segments = bashCmd.split(/(?:&&|;|\||\$\(|\(|\)|&&)/).map((s) => s.trim()).filter(Boolean);

  const uipCmds = [];

  for (const seg of segments) {
    // Tokenize the segment
    const tokens = seg.split(/\s+/).filter(Boolean);

    // Find the uip token (could be `uip`, `npx uip`, `/path/to/uip`, etc.)
    let uipIdx = -1;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      // Direct `uip` or path ending in `uip`
      if (tok === "uip" || tok.endsWith("/uip")) {
        uipIdx = i;
        break;
      }
      // `npx uip` — skip `npx` and look for `uip`
      if (tok === "npx" && tokens[i + 1] === "uip") {
        uipIdx = i + 1;
        break;
      }
      // `npx @uipath/cli`
      if (tok === "npx" && tokens[i + 1] === "@uipath/cli") {
        uipIdx = i + 1;
        break;
      }
    }

    if (uipIdx < 0) continue;

    // Extract everything after the uip token
    let args = tokens.slice(uipIdx + 1);

    // Strip global flags that appear before the subcommand.
    // Known global flags: --output, --output-filter, --log-level, --log-file,
    //   --profile, --help, -h
    // These can take a value (--output json) or not (--help).
    const GLOBAL_FLAGS_WITH_VALUE = ["--output", "--output-filter", "--log-level", "--log-file", "--profile"];
    const GLOBAL_FLAGS_BOOL = ["--help", "-h"];

    const cleaned = [];
    let i = 0;
    while (i < args.length) {
      const a = args[i];
      if (GLOBAL_FLAGS_WITH_VALUE.includes(a)) {
        // Skip the flag and its value
        i += 2;
        continue;
      }
      if (GLOBAL_FLAGS_BOOL.includes(a)) {
        i += 1;
        continue;
      }
      // Once we hit a non-flag token, that's the subcommand — stop stripping
      cleaned.push(a);
      i++;
    }

    if (cleaned.length > 0) {
      uipCmds.push(cleaned.join(" "));
    }
  }

  return uipCmds;
}

// ─── Classification ────────────────────────────────────────────────────

// MUTATING subcommands that change tenant state.
// All verified against `uip <cmd> --help` on uip v1.202.1 (Nov 2026).
const MUTATING_PATTERNS = [
  // Solution lifecycle
  /solution\s+publish\b/,
  /solution\s+deploy\s+run\b/,
  /solution\s+deploy\s+activate\b/,
  /solution\s+deploy\s+upgrade\b/,
  /solution\s+deploy\s+uninstall\b/,
  /solution\s+upload\b/,
  /solution\s+delete\b/,
  // Orchestrator resource mutations
  /or\s+processes\s+rollback\b/,
  /or\s+processes\s+update-version\b/,
  /or\s+processes\s+(create|delete)\b/,
  /or\s+assets\s+(create|delete|update)\b/,
  /or\s+queues\s+(create|delete)\b/,
  /or\s+buckets\s+(create|delete)\b/,
  /or\s+folders\s+(create|delete)\b/,
  /or\s+libraries\s+(delete|upload)\b/,
  // Job/queue mutations
  /or\s+jobs\s+(start|stop|restart)\b/,
  /or\s+queue-items\s+(start|stop|restart)\b/,
  // Maestro mutations
  /maestro\s+(case|bpmn|flow)\s+(publish|deploy|run)\b/,
  // Coded app/agent mutations
  /codedapp\s+(publish|deploy|delete)\b/,
  /codedagent\s+(publish|deploy|register)\b/,
  // Function mutations
  /function\s+(publish|push)\b/,
  // IXP mutations
  /ixp\s+projects\s+(publish|unpublish|delete)\b/,
  // Integration Service mutations
  /is\s+connectors\s+(import|publish|delete)\b/,
  // AgentHub mutations
  /agenthub\s+mcp\s+(create|delete|update)\b/,
];

// AUTHORING subcommands that write local files but don't change tenant state.
// All verified against `uip <cmd> --help` on uip v1.202.1 (Nov 2026).
const AUTHORING_PATTERNS = [
  /solution\s+init\b/,
  /solution\s+restore\b/,
  /solution\s+pack\b/,
  /solution\s+projects\s+(add|remove|import)\b/,
  /solution\s+resources\s+(refresh|add|remove|edit)\b/,
  /maestro\s+case\s+init\b/,
  /maestro\s+case\s+pack\b/,
  /maestro\s+bpmn\s+(init|pack|compile)\b/,
  /maestro\s+flow\s+init\b/,
  /maestro\s+flow\s+pack\b/,
  /rpa\s+(init|pack|restore)\b/,
];

function classify(cmd) {
  if (MUTATING_PATTERNS.some((re) => re.test(cmd))) return "MUTATING";
  if (AUTHORING_PATTERNS.some((re) => re.test(cmd))) return "AUTHORING";
  return "READ_ONLY";
}

// ─── Main ──────────────────────────────────────────────────────────────

// Read stdin (the PreToolUse payload).
let input;
try {
  const raw = readFileSync(0, "utf8");
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const command = input?.tool_input?.command;
if (typeof command !== "string" || command.length === 0) {
  process.exit(0);
}

// Extract all uip invocations from the Bash command.
const uipCmds = extractUipCommands(command);
if (uipCmds.length === 0) {
  process.exit(0);
}

// Classify each uip invocation.
const hasMutating = uipCmds.some((c) => classify(c) === "MUTATING");

// If no mutating command, allow.
if (!hasMutating) {
  process.exit(0);
}

// At least one mutating command — check the tenant.
const currentTenant = process.env.UIPATH_CURRENT_TENANT ?? process.env.OMU_TENANT ?? "";

// ── loco escape hatch: disable all guard rails ──
if (currentTenant.toLowerCase() === "loco") {
  process.stderr.write(
    `⚠ [omu-h] Guard rails disabled — tenant is "${currentTenant}" (local).\n`,
  );
  process.exit(0);
}

const isProd = currentTenant.length > 0 && PROD_RE.test(currentTenant);
const isKnown = currentTenant.length > 0;

// ── Gate 1: Prod mutation gate ──
if ((isProd || !isKnown) && !ALLOW_PROD) {
  if (isProd) {
    process.stderr.write(
      `✗ [omu-h] Blocked MUTATING uip command on Prod tenant "${currentTenant}".\n` +
      `  Command: ${command.slice(0, 200)}\n` +
      `  Set OMU_ALLOW_PROD_MUTATIONS=1 to bypass, or use omu-h rollback for safe reverts.\n`,
    );
  } else {
    process.stderr.write(
      `✗ [omu-h] Blocked MUTATING uip command — tenant is unknown.\n` +
      `  Command: ${command.slice(0, 200)}\n` +
      `  Set UIPATH_CURRENT_TENANT (or OMU_TENANT) to your tenant name,\n` +
      `  or set OMU_ALLOW_PROD_MUTATIONS=1 to bypass.\n`,
    );
  }
  process.exit(2);
}

// ── Gate 2: Skill maturity gate (only on Prod) ──
// Even if the prod gate is bypassed, block mutating commands driven by
// Preview/In-development/unknown skills on Prod unless OMU_ALLOW_PREVIEW=1.
if (isProd && !ALLOW_PREVIEW) {
  const mutatingCmds = uipCmds.filter((c) => classify(c) === "MUTATING");
  for (const cmd of mutatingCmds) {
    const skill = subcmdToSkill(cmd);
    const status = getSkillStatus(skill);
    if (status === "preview" || status === "in-development" || status === "unknown") {
      process.stderr.write(
        `✗ [omu-h] Blocked MUTATING uip command using ${status} skill "${skill}" on Prod.\n` +
        `  Command: ${command.slice(0, 200)}\n` +
        `  Set OMU_ALLOW_PREVIEW=1 to bypass for Preview/In-development skills.\n`,
      );
      process.exit(2);
    }
  }
}

// ── Allowed ──
if (ALLOW_PROD) {
  process.stderr.write(
    `⚠ [omu-h] MUTATING uip command allowed (OMU_ALLOW_PROD_MUTATIONS=1): ${command.slice(0, 120)}\n`,
  );
} else {
  process.stderr.write(
    `⚠ [omu-h] MUTATING uip command on tenant "${currentTenant}": ${command.slice(0, 120)}\n`,
  );
}
process.exit(0);