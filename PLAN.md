# PLAN.md — Phase 5: Safety guard (PreToolUse hook)

## What the upstream does (verified Nov 1 2026)

The upstream `@uipath/skills` package ships `hooks/hooks.json` with:
- `SessionStart`: runs `suggest-permissions.mjs` (nudge to install `uip` allowlist) + `set-session-env.mjs` (export session env to `uip`) + `uip track --hook`
- `PostToolUse`: `uip track --hook` on every tool use
- `SessionEnd` / `Stop` / `StopFailure`: `uip track --hook`

It does NOT have a PreToolUse hook — that's the gap omu-h fills.

## Claude Code PreToolUse hook format (verified from docs)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/safety-guard.mjs"
          }
        ]
      }
    ]
  }
}
```

- Hook receives JSON on stdin: `{ tool_name, tool_input: { command } }`
- Exit code 0 = allow, exit code 2 = block (denied)
- stderr output is shown to the user as the deny reason

## Phase 5 deliverables

### 5.1 — hooks/hooks.json

**New file: `hooks/hooks.json`**

A PreToolUse hook that matches `Bash` commands and runs `safety-guard.mjs`:
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/safety-guard.mjs\"",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

This file gets merged with the upstream's hooks.json by Claude Code's plugin system. We add the PreToolUse hook; upstream's SessionStart/PostToolUse/etc. remain.

### 5.2 — hooks/safety-guard.mjs

**New file: `hooks/safety-guard.mjs`**

A Node.js ESM script that:
1. Reads the PreToolUse JSON payload from stdin
2. Extracts `tool_input.command` (the Bash command Claude is about to run)
3. Checks if the command contains a `uip` invocation
4. If it does, classifies the uip command:
   - **MUTATING**: `solution publish`, `solution deploy run`, `solution deploy activate`, `solution deploy upgrade`, `solution deploy uninstall`, `solution upload`, `or processes rollback`, `or processes update-version`, `or assets create`, `or assets delete`, `or queues create`, `or queues delete`, `or buckets create`, `or buckets delete`, `solution delete`
   - **AUTHORING**: `solution init`, `solution restore`, `solution pack`, `solution projects add`, `solution projects remove`, `solution resources refresh`, `maestro case init`, `maestro case pack`
   - **READ_ONLY**: everything else (list, get, status, validate, search)
5. If MUTATING and the current tenant is `Prod` (from `uip login status` or env `UIPATH_CURRENT_TENANT`):
   - Block with exit code 2 and a message explaining the command was blocked for prod safety
   - The user can set `OMU_ALLOW_PROD_MUTATIONS=1` to bypass
6. If MUTATING and not prod: allow but print a warning to stderr
7. If not a uip command: allow (exit 0)

### 5.3 — plugin.json update

Update `.claude-plugin/plugin.json` to register the hooks directory:
```json
{
  ...existing fields...,
  "hooks": "./hooks/hooks.json"
}
```

### 5.4 — Tests

**New file: `test/safety-guard.test.ts`**

Tests for the safety guard logic:
- Allows non-uip Bash commands (exit 0)
- Allows READ_ONLY uip commands (exit 0)
- Allows AUTHORING uip commands (exit 0)
- Blocks MUTATING uip commands on Prod tenant (exit 2)
- Allows MUTATING uip commands on non-prod tenants (exit 0, warning)
- Allows MUTATING uip commands on Prod with `OMU_ALLOW_PROD_MUTATIONS=1` (exit 0)

### 5.5 — Update .claude-plugin/plugin.json

Add `"hooks": "./hooks/hooks.json"` to the plugin manifest so Claude Code loads the hook.

## Files to create

| File | Purpose |
|------|---------|
| `hooks/hooks.json` | PreToolUse hook manifest for Claude Code |
| `hooks/safety-guard.mjs` | Node.js ESM script — blocks MUTATING uip commands on Prod |
| `test/safety-guard.test.ts` | Tests for the safety guard logic |

## Files to modify

| File | Change |
|------|--------|
| `.claude-plugin/plugin.json` | Add `"hooks": "./hooks/hooks.json"` |
| `package.json` | Bump to 1.7.0; add `hooks/` to files array |
| `docs/UIP-COMMANDS.md` | Document safety guard |
| `README.md` | Document the safety hook + `OMU_ALLOW_PROD_MUTATIONS` bypass |

## Acceptance

- [ ] `hooks/hooks.json` registers a PreToolUse hook matching `Bash`
- [ ] `hooks/safety-guard.mjs` blocks MUTATING uip commands on Prod (exit 2)
- [ ] Non-uip commands pass through (exit 0)
- [ ] READ_ONLY and AUTHORING uip commands pass through (exit 0)
- [ ] `OMU_ALLOW_PROD_MUTATIONS=1` bypasses the block
- [ ] `npm test` passes (79 existing + new safety guard tests)
- [ ] `claude plugin validate .` passes
- [ ] `package.json` files array includes `hooks/`

## Constraints

- The hook must not break non-uip Bash commands (exit 0 fast)
- The hook must not modify the upstream hooks.json — it's a separate file
- Timeout: 5 seconds (hook must be fast — no network calls)
- Must work on Linux and macOS (Node.js ESM)