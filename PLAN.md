# oh-my-UiPath — Code Review 2.0.9 Fix Plan

> Issue #1: https://github.com/Laurentcadieux/oh-my-UiPath/issues/1

## Goal

Fix all critical and high-severity defects from the code review. Each phase ends with: build, test, `claude plugin validate .`, bump version, commit, push.

**New: `omu-h setup` configures the Prod guard rails.** The `setup` command lets the user set the prod tenant name (stored in `.omu.json` as `prodTenantPattern`). The guard reads this pattern instead of hardcoding. If the tenant name is `loco`, all guard rails are removed — every command is allowed, no MUTATING/READ_ONLY classification, no blocking. This is for local development where the user is the only operator.

---

## Phase 0 — `omu-h setup` Prod guard configuration

**Problem:** No way to configure the Prod tenant pattern from the CLI. The guard rails are either on or off via env vars, with no setup flow.

**Fix:**
- `src/cli.ts` — `omu-h setup` adds an interactive prompt:
  1. "Set Prod tenant name (current: <from .omu.json or default>): "
  2. User types a tenant name or pattern (e.g., "Prod", "prod-eu", "Production").
  3. Stored in `.omu.json` as `{ "prodTenantPattern": "<value>" }`.
  4. The hook and `runUip` read this value as the prod pattern.
- `src/config.ts` — `loadConfig()` reads `.omu.json` `prodTenantPattern` and falls back to `OMU_PROD_TENANT_PATTERN` env, then default regex.
- `hooks/safety-guard.mjs` — same: read `.omu.json` first, then env, then default.
- **`loco` escape hatch:** if the real tenant (from `uip login status`) is `loco`, all guard rails are disabled. `classify()` returns `READ_ONLY` for everything. No MUTATING blocking, no skill maturity gating, no fail-closed. The hook prints "⚠ [omu-h] Guard rails disabled — tenant is 'loco' (local)." and exits 0. `runUip` does the same.
- `src/safety.ts` (new shared module) — `isLocalTenant(tenant): boolean` returns `true` if tenant is `loco`. `isProdTenant(tenant, pattern): boolean` checks the pattern. `shouldGuard(tenant): boolean` returns `false` if `loco`.
- Tests:
  - `setup` writes `.omu.json` with `prodTenantPattern`
  - hook with tenant=loco → all commands allowed, prints warning
  - `runUip` with tenant=loco → all commands allowed
  - hook with tenant=Prod + pattern from .omu.json → blocks MUTATING
  - hook with tenant=loco → no skill maturity gating

**Files:** `src/cli.ts`, `src/config.ts`, `src/safety.ts` (new), `hooks/safety-guard.mjs`, `test/setup-guard.test.ts` (new)

---

## Phase 1 — Enforce Prod guard inside `runUip` (Critical #1, #2)

**Problem:** The hook only intercepts direct Bash commands. `omu-h deploy` calls `uip` via `spawnSync` internally — the hook never sees it. `--tenant` is accepted and ignored. `OMU_TENANT` can trick the guard.

**Fix:**
- `src/config.ts` — `runUip()` becomes the single choke point:
  1. After spawning `uip`, read `uip login status --output json` once (cache result for 30s) to get the **real** tenant name.
  2. If the command is classified as MUTATING (reuse the same patterns from the hook):
     - If real tenant is `loco` → allow all (guard rails disabled, print warning).
     - If `OMU_ALLOW_PROD_MUTATIONS=1` → allow (with warning).
     - If real tenant matches `OMU_PROD_TENANT_PATTERN` (default `/^(prod|production)([-_].*)?$/i`) → block (exit 1, error message).
     - If real tenant is empty/unknown → block (exit 1, fail-closed).
  3. If `--tenant` is passed, validate it matches the real tenant from `uip login status`. If not, error and abort.
  4. Remove trust of `OMU_TENANT` and `UIPATH_CURRENT_TENANT` for guard decisions.
- Export `classifyCommand()` from a shared module so the hook and `runUip` use the same logic.
- Tests: 
  - `runUip` blocks mutating command on Prod tenant (fake uip returns tenant=Prod)
  - `runUip` allows mutating command on non-Prod tenant
  - `runUip` blocks mutating command when tenant unknown
  - `runUip` with `OMU_ALLOW_PROD_MUTATIONS=1` allows on Prod
  - `--tenant` mismatch is rejected
  - `--tenant` match is allowed

**Files:** `src/config.ts`, `src/safety.ts` (new shared module), `test/config-guard.test.ts`

---

## Phase 2 — Default-deny hook + real tokenizing (Critical #3, #4, #5, #6, High #7)

**Problem:** Hook is allowlist-by-omission — anything not on the MUTATING list is READ_ONLY. Bad regex crashes to exit 0 (fail open). Shell quoting, variables, case, and alternative launchers bypass it.

**Fix:**
- `hooks/safety-guard.mjs`:
  1. **Default-deny:** Change `classify()` to only return `READ_ONLY` for commands matching an explicit READ-ONLY allowlist (`list`, `get`, `status`, `validate`, `search`, `help`, `--help`, `version`, `--version`). Everything else → `UNKNOWN` → block on Prod/unknown tenant.
  2. **Fail closed on exceptions:** Change the outer `catch` from `process.exit(0)` to `process.exit(2)` with a stderr message.
  3. **Tokenize properly:** Handle quoted subcommands (`"uip" solution publish`), case-insensitive matching (`uip Solution Publish`), and variable expansion (`$UIP`). Keep the existing `&&`/`;`/`|` chain handling.
  4. **Expand MUTATING patterns:** Add the missing commands: `solution deploy delete`, `solution packages delete`, `solution feeds delete`, `or queues share`, `or queues unshare`, `or folders delete`, `admin tenants delete`, `codedapp push`, `ah ... delete`, `solution upload`, `solution delete`.
  5. **`loco` escape hatch:** if the real tenant is `loco`, skip all classification and allow everything (print warning, exit 0). No skill maturity gating either.
  6. **Widen Prod regex:** Default to `/^(prod|prd|production)([-_.].*)?$/i` — catches `prod1`, `acme-prod`, `eu-production`, `prod.eu`, `ProdTenant`.
  7. **Don't match on free text:** Only tokenize the actual command position, not the full string. `git commit -m "uip solution publish"` should not match.
- Tests: one case per bypass from the issue.

**Files:** `hooks/safety-guard.mjs`, `test/safety-guard.test.ts`

---

## Phase 3 — Fix promote gates + rollback env (High #8, #9, #10)

**Problem:** Promote always passes gates. Rollback can't find snapshots. Snapshots stored in cwd.

**Fix:**
- `src/engine/environments.ts`:
  1. `promote()` — stop hardcoding gate inputs to pass. Require real inputs:
     - Run `uip rpa validate` → parse result for `validationPassed`
     - Run `uip rpa build` → parse result for build success
     - Run `uip or processes list` → count published processes for test pass rate
     - If inputs not available (no solution path), print "no gates checked" instead of fake OK
  2. Add sanity rules: reject `prod → dev`, reject `dev → dev`, reject same-env promotion.
  3. Validate `.omu-env.json` — if malformed, error and stop.
  4. Validate `minTestPassRate` — reject negative or > 1.
  5. Default tenant names from `uip login status`, not hardcoded "Dev"/"Test"/"Prod".
- `src/engine/rollback.ts`:
  1. Key snapshots by tenant + folder, not just env.
  2. Store snapshots under `~/.omu/snapshots/` (create dir if missing), not cwd.
  3. `recordPreDeployVersions` — use real tenant from `uip login status`.
  4. `loadLastSnapshot` — look up by tenant + folder + env.
- CLI `promote`: pass real gate inputs from the solution validation, not `true`/`0`/`1.0`.
- Tests: 
  - promote: real gates, prod→dev rejected, dev→dev rejected, malformed .omu-env.json errors, negative minTestPassRate rejected
  - rollback: finds snapshot by tenant+folder, works from any cwd

**Files:** `src/engine/environments.ts`, `src/engine/rollback.ts`, `src/cli.ts`, `test/phase4.test.ts`

---

## Phase 4 — Validate inputs + fix sync + rea (High #11, #12, #13, #16)

**Problem:** deploy publishes guessed paths. sync reports wrong data. rea passes bad input to uip. Failed publish still runs quality-gate.

**Fix:**
- `src/agents/deployment-manager.ts`:
  1. Validate `--solution` / `--sdd` path exists before running anything. Error if missing.
  2. `--dry-run` — don't report success for nonexistent paths.
  3. Stop on failure: if `solution publish` fails, don't run quality-gate.
- `src/agents/diagnostician.ts` or `src/engine/recovery.ts`:
  4. Stop on failure: if a stage fails, skip downstream stages and report which failed.
- `src/agents/orchestrator.ts` (sync):
  5. Read `assets/skill-status.json` correctly — count statuses properly.
  6. Read upstream `version-manifest.json` — report version number, not "unknown".
- `src/agents/rea-uipath.ts`:
  7. Validate input path exists before calling uip. Error if missing.
  8. If type is "unknown", fail with clear message, don't proceed.
- Tests:
  - deploy with nonexistent --solution → error, no uip calls
  - deploy --dry-run with nonexistent path → error
  - publish fails → quality-gate not called
  - sync reads correct counts
  - rea with nonexistent path → error, no uip calls
  - rea with unknown type → error

**Files:** `src/agents/deployment-manager.ts`, `src/agents/rea-uipath.ts`, `test/delivery-mapper.test.ts` (or new test files)

---

## Phase 5 — Docs, uip path, timeout, stale skills (Medium #14, #15, #17, #18, #19)

**Problem:** Docs say `omu` not `omu-h`. uip path hardcoded. No timeout. Stale skill-status.json. Mutation lock may not work.

**Fix:**
- `AGENTS.md`:
  1. Update: `omu` → `omu-h`, "27 skills" → "28 skills", remove solution-builder + case-architect, add diagnostician + reviewer + rea-uipath, remove `memory.md`/`RaceTime.md` references.
  2. Fix deploy description to match actual behavior.
- `src/config.ts`:
  3. Find `uip` on PATH first, fall back to `~/.npm-global/bin/uip`. Don't hardcode.
  4. Add timeout to `spawnSync` calls (default 120s, configurable via `OMU_UIP_TIMEOUT`).
- `assets/skill-status.json`:
  5. Re-copy from latest `@uipath/skills` package (sync command should update it).
- `src/engine/mutation-lock.ts`:
  6. Verify lock is actually acquired before MUTATING commands. Add a test with two concurrent deploys.
- Tests: 
  - uip found on PATH before hardcoded fallback
  - timeout kills hung process

**Files:** `AGENTS.md`, `src/config.ts`, `src/engine/mutation-lock.ts`, `test/mutation-lock.test.ts`

---

## Phase 6 — Regression tests for all hook bypasses (Critical #3)

**Problem:** The issue lists specific bypass cases that need regression tests.

**Fix:**
- Add one test case per bypass from the issue:
  - `solution deploy delete` → MUTATING (was not classified)
  - `solution packages delete` → MUTATING
  - `solution feeds delete` → MUTATING
  - `or queues share` → MUTATING
  - `or queues unshare` → MUTATING
  - `or folders delete` → MUTATING (improve pattern)
  - `admin tenants delete` → MUTATING
  - `codedapp push` → MUTATING
  - `ah ... delete` → MUTATING
  - Quoted: `"uip" solution publish` → caught
  - Case: `uip Solution Publish` → caught
  - `git commit -m "uip solution publish"` → NOT caught (false positive fix)
  - `node .../cli/dist/index.js` → NOT a false positive (it's not uip)
  - `npx -y @uipath/cli` → caught
  - `bash -c "uip solution publish"` → caught
  - **`loco` escape hatch:** tenant=loco → all MUTATING commands allowed, no skill gating

**Files:** `test/safety-guard.test.ts`

---

## Phase 7 — README accuracy pass

**Problem:** README claims must map to actual code behavior.

**Fix:**
- Audit every README claim against the code:
  - "blocks publish/deploy/activate on Prod" → must be true for BOTH hook and `runUip`
  - "stop-on-failure" → must be true for all stages, not just some
  - "skill maturity gating" → must actually block, not just warn
  - Remove any claim that the code doesn't back up
  - Update agent count (was 6, now matches actual agents)
  - Update test count to match
- `docs/UIP-COMMANDS.md` — update with any new commands added in Phase 1-6

**Files:** `README.md`, `docs/UIP-CMANDS.md`

---

## Execution

- Sequential phases, one commit each.
- After each phase: `npm run build`, `npm test`, `claude plugin validate .`, bump version, commit, push.
- Start version: 2.1.0 (this is a significant fix release).
- End state: all critical/high/medium issues from #1 resolved.