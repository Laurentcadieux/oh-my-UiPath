# PLAN.md — Phase 2: Complement upstream instead of duplicating it

## What upstream provides (verified Nov 1 2026)

- `@uipath/skills` v1.204.1 on npm — contains `version-manifest.json`, `assets/skill-status.json`, `assets/cli-versions.json`, `assets/uip-catalog-snapshot.json`
- 30 installed skills at `~/.agents/skills/` (not 27 — `CANONICAL_SKILLS` was wrong)
- `assets/skill-status.json` maps each skill to: **Stable** (14), **Preview** (12), **In-development** (4)
- `uipath-planner` — PDD→SDD + task derivation (Stable)
- `uipath-troubleshoot` — diagnostic investigation (Preview)
- `uipath-review` — read-only review with `uip rpa validate`/`build` (Preview)

## Phase 2 deliverables

### 2.1 — Plan stage: use upstream uipath-planner

**Current state:** orchestrator agent runs `uip or folders list` — no real planning.

**Change:** 
- Add `--use-upstream-planner` flag to `autopilot` (default: on). When on, the orchestrator delegates to `uipath-planner` by loading its SKILL.md and following its Lane A (PDD-driven) path: read the SDD, derive tasks, emit the task list.
- The orchestrator calls `uip maestro case sdd parse <sdd>` (verified: exists in `uip maestro case sdd parse --help`) to parse the SDD, then `uip maestro case sdd resolve` to resolve references.
- Keep omu-h's own planning as a fallback behind `--no-upstream-planner`.
- The orchestrator stores the task list in `AgentContext` (new field `taskList?: string`) so downstream agents know what to build.

### 2.2 — Skill catalog: sync from upstream + status awareness

**Current state:** `CANONICAL_SKILLS` hardcodes 27 names. No status. Missing `uipath-troubleshoot`.

**Change:**

**New file: `src/skill-status.ts`**
- `loadSkillStatus(): SkillStatusMap` — reads `assets/skill-status.json` from the installed skills root (or downloads it from `@uipath/skills` npm package if not found locally).
- `getSkillStatus(name: string): 'stable' | 'preview' | 'in-development' | 'unknown'`
- `loadVersionManifest(): { skillsVersion: string; targetCli: string }` — reads `version-manifest.json`.

**New CLI command: `omu-h sync`**
- Downloads `@uipath/skills` latest version info from npm (`npm view @uipath/skills version`).
- Compares against locally installed skills catalog.
- Reports: new skills (in upstream but not installed), removed skills (installed but not in upstream), changed skills (status changed since last sync).
- Stores a `.omu-sync.json` file with the last-synced version + status snapshot.

**Remove `CANONICAL_SKILLS`** — replace all references with `loadSkills()` from the catalog.

**Pipeline status gating:**
- Before running a step, check the skill's status.
- If `preview` or `in-development` and `ctx.tenant === 'prod'` (or `Prod`): refuse unless `--allow-preview` is passed.
- If `preview` or `in-development` and not prod: warn but continue.
- Add `allowPreview: boolean` to `AgentContext`.

### 2.3 — Bind uipath-troubleshoot and uipath-review

**New agent: `diagnostician` (wraps uipath-troubleshoot)**
- When a step fails (validate, deploy, test), the pipeline feeds the error + logs to the diagnostician.
- The diagnostician loads `uipath-troubleshoot/SKILL.md`, follows its investigation procedure: anchor the entity, extract signals, route to a playbook, run diagnostic `uip` commands, present root cause.
- It does NOT apply fixes — it diagnoses and recommends.
- Added to the autopilot pipeline as a recovery step after failures.

**New agent: `reviewer` (wraps uipath-review)**
- Runs after `build` and before `deploy`.
- Loads `uipath-review/SKILL.md`, runs `uip rpa validate` + `uip rpa build` + `uip maestro case validate` as applicable.
- Produces a structured review report with findings (Critical/Warning/Info).
- If any **Critical** finding: stop the pipeline, report to the user.
- If only **Warning**: continue but warn.

**Update `quality-gate`** to call the reviewer for validation instead of running its own `uip maestro case validate` directly.

**Update `autopilot`** to include the reviewer step between build and deploy, and the diagnostician as a failure-recovery step.

## Files to create

| File | Purpose |
|------|---------|
| `src/skill-status.ts` | Load + query skill status from upstream `assets/skill-status.json` |
| `src/agents/diagnostician.ts` | Wraps `uipath-troubleshoot` — diagnoses failures |
| `src/agents/reviewer.ts` | Wraps `uipath-review` — validates + reviews before deploy |
| `test/skill-status.test.ts` | Tests for skill status loading |
| `test/sync.test.ts` | Tests for sync command |

## Files to modify

| File | Change |
|------|--------|
| `src/types.ts` | Add `taskList?`, `allowPreview`, `skillStatusMap?` to `AgentContext` |
| `src/skills/skill-loader.ts` | Remove `CANONICAL_SKILLS`, use catalog only |
| `src/agents/index.ts` | Register `diagnostician` + `reviewer` |
| `src/agents/orchestrator.ts` | Call upstream planner when `--use-upstream-planner` (default on) |
| `src/agents/quality-gate.ts` | Delegate validation to reviewer agent |
| `src/workflows/autopilot.ts` | Add reviewer step (after build, before deploy) + diagnostician on failure |
| `src/cli.ts` | Add `sync` command, `--use-upstream-planner` / `--no-upstream-planner` flags, `--allow-preview` flag |
| `package.json` | Bump to 1.4.0 |
| `docs/UIP-COMMANDS.md` | Add new commands |
| `README.md` | Document sync, status gating, reviewer + diagnostician |

## Acceptance

- [ ] `omu-h sync` reports skill status (Stable/Preview/In-development) + new/removed/changed
- [ ] Pipeline warns on Preview/In-development, refuses on prod without `--allow-preview`
- [ ] Orchestrator delegates to upstream `uipath-planner` by default
- [ ] `diagnostician` agent loads `uipath-troubleshoot` SKILL.md and diagnoses failures
- [ ] `reviewer` agent loads `uipath-review` SKILL.md, runs `uip rpa validate` + `build`, gates on Critical
- [ ] `npm test` passes (existing 22 + new tests)
- [ ] `claude plugin validate .` passes
- [ ] No `CANONICAL_SKILLS` hardcode — all from catalog
- [ ] Every `uip` command verified against `uip --help`