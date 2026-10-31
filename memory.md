# memory.md — agent context recovery for oh-my-UiPath

> Short, scannable state notes so any agent can resume work after a context reset.

## Current goal
Scaffold the `oh-my-UiPath` project at `/home/uipath-coder/oh-my-UiPath`: a multi-agent orchestration layer for UiPath, inspired by `oh-my-claudecode`, wrapping the `uip` CLI and the 27 installed UiPath skills.

## Done
- Repo exists at `/home/uipath-coder/oh-my-UiPath` on `main` (empty `.git`, no commits yet).
- All source, docs, templates, and config files written.
- TypeScript compiles clean: `tsc --noEmit` passes.

## In progress
- Nothing. Scaffold is complete.

## Blocked
- Root `AGENTS.md` could not be written — a protected agent-instruction-file guard denied the write. The intended content is ready and should be created manually by the user (or via an interactive session that can grant consent). `docs/AGENTS.md` (the reference doc, not the agent-instruction file) was written successfully.
- No `npm install` / build verification of runtime beyond typecheck; `npm install` was not run in this session.

## Key decisions and why
- **CommonJS + `tsc` to `dist/`** — keeps `bin/omu: ./dist/cli.js` runnable directly under `node` with no bundler.
- **`runUip()` in `src/config.ts`** is the single sanctioned way agents invoke `uip`; agents never call UiPath HTTP APIs directly, so no output is fabricated.
- **Agents map 1:1 to UiPath platform slices** — orchestrator (platform/solution), solution-builder (solution/rpa), case-architect (maestro-case/planner), deployment-manager (solution/platform), quality-gate (test/maestro-case/review).
- **Skills loaded from the catalog** at `~/.agents/skills/skills.catalog.json` — 27 skills, single source of truth.

## Files that matter next
- `src/cli.ts` — add new subcommands here.
- `src/agents/index.ts` — register new agents here.
- `src/workflows/index.ts` — register new workflows here.
- `docs/AGENTS.md`, `docs/WORKFLOWS.md`, `docs/SKILLS.md` — keep in sync with the registries.
