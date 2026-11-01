#!/usr/bin/env node
/**
 * safety-guard.mjs — PreToolUse hook for oh-my-UiPath.
 *
 * Intercepts Bash commands that invoke the `uip` CLI and applies safety
 * rules:
 *
 *  - Non-uip commands: pass through (exit 0, no overhead beyond a regex).
 *  - READ_ONLY uip commands (list, get, status, validate, search): pass.
 *  - AUTHORING uip commands (init, restore, pack, projects add/remove,
 *    resources refresh, case init/pack): pass.
 *  - MUTATING uip commands (publish, deploy run/activate/upgrade/uninstall,
 *    upload, rollback, update-version, create/delete on assets/queues/buckets,
 *    solution delete): **blocked when the active tenant is Prod** (exit 2)
 *    unless `OMU_ALLOW_PROD_MUTATIONS=1` is set in the environment.
 *  - MUTATING on non-prod: pass with a warning to stderr.
 *
 * Input (stdin JSON): { "tool_name": "Bash", "tool_input": { "command": "..." } }
 * Exit 0 = allow, exit 2 = block (stderr shown to user).
 *
 * No network calls. Runs in < 5 seconds (no network, just string matching).
 */
import { readFileSync } from "node:fs";

// --- Read stdin (the PreToolUse payload) ---
let input;
try {
  const raw = readFileSync(0, "utf8");
  input = JSON.parse(raw);
} catch {
  // Can't parse — allow the command (don't break Claude Code).
  process.exit(0);
}

const command = input?.tool_input?.command;
if (typeof command !== "string" || command.length === 0) {
  process.exit(0);
}

// --- Is this a uip command? ---
// Match `uip` as a word-boundary command (not a substring like "recoop").
const uipMatch = /\buip\b/.test(command);
if (!uipMatch) {
  // Not a uip command — pass through immediately.
  process.exit(0);
}

// --- Classify the uip command ---

// MUTATING subcommands that change tenant state.
const MUTATING_PATTERNS = [
  /\buip\s+(solution\s+)?publish\b/,
  /\buip\s+solution\s+deploy\s+run\b/,
  /\buip\s+solution\s+deploy\s+activate\b/,
  /\buip\s+solution\s+deploy\s+upgrade\b/,
  /\buip\s+solution\s+deploy\s+uninstall\b/,
  /\buip\s+solution\s+upload\b/,
  /\buip\s+solution\s+delete\b/,
  /\buip\s+or\s+processes\s+rollback\b/,
  /\buip\s+or\s+processes\s+update-version\b/,
  /\buip\s+or\s+assets\s+(create|delete|update)\b/,
  /\buip\s+or\s+queues\s+(create|delete)\b/,
  /\buip\s+or\s+buckets\s+(create|delete)\b/,
  /\buip\s+or\s+folders\s+(create|delete)\b/,
  /\buip\s+or\s+processes\s+(create|delete)\b/,
  /\buip\s+or\s+libraries\s+(delete|upload)\b/,
  /\buip\s+or\s+(jobs|queue-items)\s+(start|stop|restart)\b/,
  /\buip\s+maestro\s+(case|bpmn|flow)\s+(publish|deploy|run)\b/,
  /\buip\s+codedapp\s+(publish|deploy|delete)\b/,
  /\buip\s+codedagent\s+(publish|deploy|register)\b/,
  /\buip\s+function\s+(publish|push)\b/,
  /\buip\s+ixp\s+projects\s+(publish|unpublish|delete)\b/,
  /\buip\s+is\s+connectors\s+(import|publish|delete)\b/,
  /\buip\s+agenthub\s+mcp\s+(create|delete|update)\b/,
];

// AUTHORING subcommands that write local files but don't change tenant state.
const AUTHORING_PATTERNS = [
  /\buip\s+solution\s+init\b/,
  /\buip\s+solution\s+restore\b/,
  /\buip\s+solution\s+pack\b/,
  /\buip\s+solution\s+projects\s+(add|remove|import)\b/,
  /\buip\s+solution\s+resources\s+(refresh|add|remove|edit)\b/,
  /\buip\s+maestro\s+case\s+init\b/,
  /\buip\s+maestro\s+case\s+pack\b/,
  /\buip\s+maestro\s+bpmn\s+(init|pack|compile)\b/,
  /\buip\s+maestro\s+flow\s+init\b/,
  /\buip\s+maestro\s+flow\s+pack\b/,
  /\buip\s+rpa\s+(init|pack|restore)\b/,
];

function isMutating(cmd) {
  return MUTATING_PATTERNS.some((re) => re.test(cmd));
}

function isAuthoring(cmd) {
  return AUTHORING_PATTERNS.some((re) => re.test(cmd));
}

const mutating = isMutating(command);
const authoring = isAuthoring(command);

// READ_ONLY or unknown: pass through.
if (!mutating && !authoring) {
  process.exit(0);
}

// AUTHORING: always pass through (local files only).
if (authoring && !mutating) {
  process.exit(0);
}

// MUTATING: check the tenant.
// The current tenant is available via UIPATH_CURRENT_TENANT (set by
// set-session-env.mjs) or by checking `uip login status`.
const currentTenant = process.env.UIPATH_CURRENT_TENANT ?? process.env.OMU_TENANT ?? "";
const isProd = currentTenant.toLowerCase() === "prod";

if (mutating) {
  // Check bypass flag.
  if (process.env.OMU_ALLOW_PROD_MUTATIONS === "1") {
    process.stderr.write(
      `⚠ [omu-h] MUTATING uip command allowed (OMU_ALLOW_PROD_MUTATIONS=1): ${command.slice(0, 120)}\n`,
    );
    process.exit(0);
  }

  if (isProd) {
    process.stderr.write(
      `✗ [omu-h] Blocked MUTATING uip command on Prod tenant.\n` +
      `  Command: ${command.slice(0, 200)}\n` +
      `  Set OMU_ALLOW_PROD_MUTATIONS=1 to bypass, or use omu-h rollback for safe reverts.\n`,
    );
    process.exit(2);
  }

  // Non-prod: warn but allow.
  process.stderr.write(
    `⚠ [omu-h] MUTATING uip command on tenant "${currentTenant}": ${command.slice(0, 120)}\n`,
  );
  process.exit(0);
}

process.exit(0);