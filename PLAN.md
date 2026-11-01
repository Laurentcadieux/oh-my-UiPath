# PLAN.md — Phase 4: Recovery, gates and rollback

## What exists now

- 7 agents: orchestrator, solution-builder, case-architect, reviewer, quality-gate, deployment-manager, diagnostician
- Autopilot: plan → case → build → review → deploy → test (sequential + parallel engine)
- Diagnostician runs on failure but only logs — no self-healing or retry
- No environment promotion (dev → test → prod)
- No rollback — no version tracking before deploy
- No gates beyond stop-on-failure

## Verified uip commands for Phase 4 (uip v1.202.1)

| Command | Purpose |
|---------|---------|
| `uip or processes list --all-folders --output json` | Get process keys + current versions |
| `uip or processes version-history <key> --output json` | List version history per process |
| `uip or processes rollback <key> --folder-path <p> --output json` | Rollback to previous version |
| `uip or processes update-version <keys> --package-version <v> --output json` | Update to specific version |
| `uip solution deploy status <id> --output json` | Check deployment status |
| `uip solution deploy list --folder-path <p> --output json` | List deployments |
| `uip solution deploy upgrade <key> --version <v> --output json` | Upgrade in place |
| `uip solution deploy uninstall <name> --output json` | Uninstall a deployment |
| `uip login tenant set <name>` | Switch active tenant |
| `uip login tenant list --output json` | List available tenants |

## Phase 4 deliverables

### 4.1 — Self-healing (diagnostician + retry)

**Modify: `src/agents/diagnostician.ts`**

When a pipeline step fails, the diagnostician:
1. Loads `uipath-troubleshoot/SKILL.md` and follows its investigation procedure
2. Runs diagnostic `uip` commands (read-only: `deploy status`, `jobs logs`, `processes list`)
3. Classifies the error:
   - **AUTHORING fix** (local files): can be auto-applied — e.g. re-run `solution pack`, fix a binding
   - **TENANT fix** (changes tenant state): requires user confirmation — e.g. re-publish, re-deploy, update-version
4. For AUTHORING fixes: apply automatically, retry the failed step (max 2 retries)
5. For TENANT fixes: present the recommended `uip` command, wait for user confirmation via `AskUserQuestion`-style prompt (in CLI, print the command and ask for `--confirm`)

**New file: `src/engine/recovery.ts`**
- `attemptRecovery(ctx, failure): Promise<RecoveryResult>` — runs the diagnostician, classifies the fix, applies if AUTHORING, asks if TENANT
- `RecoveryResult`: `{ applied: boolean, retried: boolean, output: string, requiresConfirmation: boolean }`
- Max 2 retries per failed step

**Modify: `src/engine/index.ts`**
- After a task fails, call `attemptRecovery` before cancelling dependents
- If recovery succeeds and retries < 2, re-run the failed task
- If recovery fails or requires unconfirmed TENANT changes, cancel dependents

### 4.2 — Environments (dev → test → prod)

**New file: `src/engine/environments.ts`**
- `EnvironmentConfig`: `{ dev: EnvTarget, test: EnvTarget, prod: EnvTarget }`
- `EnvTarget`: `{ tenant: string, folder: string, requireValidation: boolean, requireReview: boolean, minTestPassRate: number, requireConfirmation: boolean }`
- `loadEnvironments(): EnvironmentConfig` — reads from `.omu-env.json` in cwd or env vars
- `promote(ctx, from: string, to: string): Promise<PromotionResult>` — validates gates then switches tenant

**Gates (checked before promotion):**
1. `validate` passed (no failures in the validate/review stage)
2. No blocking `uipath-review` findings (Critical severity)
3. Test pass rate ≥ `minTestPassRate` (default 80%)
4. If target is `prod`: require explicit user confirmation

**New CLI command: `omu-h promote <from> <to>`**
- `omu-h promote dev test` — promotes from dev to test
- `omu-h promote test prod` — promotes from test to prod (requires `--confirm`)
- `--dry-run`: prints what would happen (gates check, tenant switch, deploy)

**New file: `.omu-env.json` template** (in `templates/`):
```json
{
  "dev": { "tenant": "Dev", "folder": "Shared", "requireValidation": true, "requireReview": true, "minTestPassRate": 0.8, "requireConfirmation": false },
  "test": { "tenant": "Test", "folder": "Shared", "requireValidation": true, "requireReview": true, "minTestPassRate": 0.9, "requireConfirmation": false },
  "prod": { "tenant": "Prod", "folder": "Shared", "requireValidation": true, "requireReview": true, "minTestPassRate": 1.0, "requireConfirmation": true }
}
```

### 4.3 — Rollback

**New file: `src/engine/rollback.ts`**
- `recordPreDeployVersions(ctx): Promise<VersionSnapshot>` — before each deploy, fetch `uip or processes list --all-folders --output json` and record each process's active version
- `rollback(ctx, env: string): Promise<RollbackResult>` — restores the recorded versions via `uip or processes rollback <key> --folder-path <p>`

**Version snapshot:**
- Stored in `.omu-versions.json` in cwd
- One entry per deploy: `{ timestamp, env, processes: [{ key, name, version }] }`
- `rollback` reads the last entry for the given env and runs `uip or processes rollback` for each process

**New CLI command: `omu-h rollback <env>`**
- `omu-h rollback prod` — restores the pre-deploy versions for prod
- `--dry-run`: prints what would be rolled back (process names + versions)
- Reads `.omu-versions.json` for the last snapshot

**Modify: `src/agents/deployment-manager.ts`**
- Before `deploy run`, call `recordPreDeployVersions(ctx)` and store the snapshot
- This is a READ_ONLY operation (just fetching process list)

## Files to create

| File | Purpose |
|------|---------|
| `src/engine/recovery.ts` | Self-healing: diagnose → classify fix → apply (AUTHORING) or ask (TENANT) → retry (max 2) |
| `src/engine/environments.ts` | Environment config (dev/test/prod), promotion gates, `loadEnvironments` |
| `src/engine/rollback.ts` | Pre-deploy version snapshot + `rollback(env)` via `uip or processes rollback` |
| `test/recovery.test.ts` | Tests for recovery + retry logic |
| `test/environments.test.ts` | Tests for promotion gates |
| `test/rollback.test.ts` | Tests for version snapshot + rollback |
| `templates/.omu-env.json` | Environment config template |

## Files to modify

| File | Change |
|------|--------|
| `src/agents/diagnostician.ts` | Classify fixes (AUTHORING vs TENANT), apply AUTHORING fixes, recommend TENANT fixes |
| `src/engine/index.ts` | Call `attemptRecovery` on failure, retry if applied, cancel if not |
| `src/agents/deployment-manager.ts` | Record pre-deploy version snapshot |
| `src/cli.ts` | Add `promote` and `rollback` commands |
| `src/types.ts` | Add `EnvironmentConfig`, `VersionSnapshot`, `RecoveryResult` types |
| `package.json` | Bump to 1.6.0 |
| `docs/UIP-COMMANDS.md` | Add rollback + promotion commands |
| `README.md` | Document `promote`, `rollback`, self-healing |

## Acceptance

- [ ] Diagnostician classifies failures as AUTHORING vs TENANT
- [ ] AUTHORING fixes auto-applied, failed step retried (max 2)
- [ ] TENANT fixes require user confirmation (printed command + --confirm)
- [ ] `omu-h promote dev test` checks gates (validate passed, no Critical review, test pass rate)
- [ ] `omu-h promote test prod` requires `--confirm`
- [ ] Pre-deploy version snapshot recorded in `.omu-versions.json`
- [ ] `omu-h rollback prod` restores pre-deploy versions via `uip or processes rollback`
- [ ] `--dry-run` on promote + rollback prints what would happen
- [ ] `npm test` passes (55 existing + new recovery/env/rollback tests)
- [ ] `claude plugin validate .` passes
- [ ] Every `uip` command verified against `uip --help`

## Constraints

- Never auto-apply a fix that changes tenant state without user confirmation
- Max 2 retries per failed step
- Prod always requires explicit confirmation
- All `uip` calls go through the real binary
- Do NOT modify or fork upstream skills