# PLAN.md — Phase 1: Correctness and Hygiene

## Audit findings (uip CLI v1.202.1, verified Nov 1 2026)

### Broken commands in src/agents/*.ts

| Agent | Code says | Real uip surface | Fix |
|-------|-----------|-----------------|-----|
| deployment-manager | `solution upload --path <target>` | `solution upload <solutionPath>` (positional) | positional arg |
| deployment-manager | `solution publish --folder <f>` | `solution publish <packagePath>` (positional, no --folder) | positional + `--personal-workspace` or tenant feed |
| deployment-manager | `solution deploy --folder <f>` | `solution deploy run --parent-folder-path <p>` | subcommand `deploy run` + `--parent-folder-path` |
| deployment-manager | `solution activate` | `solution deploy activate <deployment-name>` | subcommand `deploy activate` + positional name |
| case-architect | `maestro case init --from-sdd <sdd>` | `maestro case init <name>` (positional, no --from-sdd) | positional `<name>` |
| case-architect | `maestro case validate` | `maestro case validate <file>` (positional required) | add `<file>` arg |
| case-architect | `maestro case pack` | `maestro case pack <project-path> <output-path>` (2 positionals) | add both positionals |
| solution-builder | `solution init --name <n>` | `solution init <solutionName>` (positional) | positional arg |
| solution-builder | `solution restore` | `solution restore <solutionPath>` (positional required) | add positional |
| solution-builder | `solution pack --output <dir>` | `solution pack <solutionPath> <output-path>` (2 positionals) | both positionals |
| quality-gate | `maestro case validate` | `maestro case validate <file>` (positional) | add `<file>` arg |
| quality-gate | `rpa analyze --json` | `uip rpa` requires rpa-tool (EACCES); `--json` should be `--output json` | fix flag to `--output json`; mark rpa-tool as unverified |
| quality-gate | `test run --json` | `uip test` does not exist as top-level command | remove or route to `uip or` subcommands |
| orchestrator | `orchestrator folders list --json` | `uip or folders list --output json` (flag is `--output json` not `--json`) | fix flag |

### Stop-on-failure

Every agent runs all `uip` calls regardless of previous failures. `makeResult` aggregates exit codes but does not short-circuit. `runUip` is `spawnSync` (synchronous), so we just need to check the exit code after each call and skip the rest.

### No tests / no LICENSE / no icon

- `npm test` falls back to `tsc --noEmit` — no real test runner
- No `LICENSE` file
- `plugin.json` has no `author` / `license` fields
- No `.claude-plugin/icon.png`
- `memory.md` and `RaceTime.md` in `files` array and in git

## Phase 1 deliverables

### 1.1 — Stop on failure in every agent

Modify `src/config.ts`:
- `runUip` already returns exit code. Add a helper `runUipChain(ctx, steps: {args, label}[])` that runs each step, stops on first non-zero exit, and returns the accumulated results + which step failed.

Modify all 5 agents:
- Replace sequential `runUip` + `makeResult` calls with `runUipChain`.

### 1.2 — Fix every broken uip command

Fix all 14 issues from the audit table above. Each agent will use the correct positional args and flags verified against `uip --help`.

### 1.3 — docs/UIP-COMMANDS.md

Markdown table: command, agent, verified yes/no, source (`uip --help` or upstream SKILL.md).

### 1.4 — Fake uip binary + real tests

- `test/fake-uip.js` — a Node script that:
  - Reads `test/uip-script.json` (array of `{args, exitCode, stdout}`).
  - Records all calls to `test/uip-calls.log`.
  - Returns the scripted exit code + stdout for the matching args.
- `test/*.test.ts` — unit tests for:
  - Each agent (happy path + failure path)
  - Each workflow (including `--dry-run`)
  - `runUipChain` (stop-on-failure)
- `package.json` test script: `tsc && node --test dist/test/*.test.js` (no fallback to tsc)
- Set `OMU_UIP_BIN` to the fake uip path in tests.

### 1.5 — LICENSE + plugin metadata + icon

- Create `LICENSE` (MIT, © Laurent Cadieux)
- Add `author` and `license` to `.claude-plugin/plugin.json`
- Add marketplace `description` to `.claude-plugin/marketplace.json`
- Generate `.claude-plugin/icon.png` (512×512, simple PNG)

### 1.6 — Remove memory.md + RaceTime.md from public repo

- `git rm --cached memory.md RaceTime.md`
- Add to `.gitignore`
- Remove from `package.json` `files` array
- Keep local copies (just untracked)

## After Phase 1

- `npm run build` — passes
- `npm test` — runs real tests, all pass
- `npx claude plugin validate .` — passes (if available)
- Bump version to 1.3.0
- Commit + push
- Report what changed with real numbers