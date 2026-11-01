# memory.md — agent context recovery for oh-my-UiPath

> Short, scannable state notes so any agent can resume work after a context reset.

## Current goal

Build and ship `oh-my-UiPath` — a multi-agent orchestration layer for UiPath, inspired by `oh-my-claudecode`, wrapping the `uip` CLI and the 27 installed UiPath skills.

## Project facts

- **Local path:** `/home/uipath-coder/oh-my-UiPath`
- **GitHub:** https://github.com/Laurentcadieux/oh-my-UiPath
- **npm:** `oh-my-uipath-h@1.1.2` — https://www.npmjs.com/package/oh-my-uipath-h
- **CLI command:** `omu-h` (not `omu`)
- **Git:** main branch, user.email = `laurent@cadieux.dev`, user.name = `Laurent Cadieux`
- **Git remote:** `git@github.com-oh-my:Laurentcadieux/oh-my-UiPath.git`
- **SSH key:** `~/.ssh/oh-my-uipath` (deploy key on GitHub, write access)

## Done

- ✅ Project scaffolded (5 agents, 3 workflows, 27 skills, CLI, docs, templates)
- ✅ TypeScript compiles clean: `tsc --noEmit` passes
- ✅ AGENTS.md created at repo root (Claude Code plugin section added)
- ✅ Claude Code plugin structure: `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json`
- ✅ `agents/` and `commands/` at repo root (moved from `.claude-plugin/` for plugin path resolution)
- ✅ CLI renamed `omu` → `omu-h`
- ✅ `omu-h setup` command added (checks uip CLI, skills count, auth status)
- ✅ Published to npm as `oh-my-uipath-h@1.1.2`
- ✅ Claude Code plugin verified working: `/plugin install oh-my-uipath-h@oh-my-uipath`
- ✅ README updated with full prerequisites table + step-by-step setup guide (Steps 1-7)
- ✅ RaceTime.md updated with all milestones

## Blocked

- npm publish required 2FA bypass on the npm account — resolved after user disabled 2FA on account settings
- npm tokens were staging-only until account-level staging was disabled

## Key decisions

- **CommonJS + `tsc` to `dist/`** — keeps `bin/omu-h: ./dist/cli.js` runnable directly under `node`
- **`runUip()` in `src/config.ts`** is the single sanctioned way agents invoke `uip`; never fabricate output
- **Agents map 1:1 to UiPath platform slices** — orchestrator (platform/solution), solution-builder (solution/rpa), case-architect (maestro-case/planner), deployment-manager (solution/platform), quality-gate (test/maestro-case/review)
- **Skills loaded from catalog** at `~/.agents/skills/skills.catalog.json` — 27 skills
- **Plugin layout:** `.claude-plugin/` has only `plugin.json` + `marketplace.json`; `agents/` and `commands/` at repo root for path resolution
- **Claude Code plugin install:** one command at a time (not same line): `/plugin marketplace add` then `/plugin install`

## Files that matter next

- `src/cli.ts` — add new subcommands here
- `src/agents/index.ts` — register new agents here
- `src/workflows/index.ts` — register new workflows here
- `docs/agents-reference.md`, `docs/WORKFLOWS.md`, `docs/SKILLS.md` — keep in sync with registries