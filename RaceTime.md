# RaceTime.md — oh-my-UiPath timeline

> High-signal changelog. Newest entry on top. One entry per landed change.

## 2026-11-01T15:01:00Z — README updated with full setup guide + prerequisites

- Added Prerequisites table (Node 22+, uip CLI 1.197+, 27 skills, UiPath Cloud, Claude Code, OS)
- Step-by-step setup guide (Steps 1-7)
- Documented `omu-h setup` command with expected output
- Updated project layout to reflect moved agents/ and commands/ at repo root
- Claude Code plugin install instructions (one command at a time)

## 2026-11-01T14:46:00Z — Claude Code marketplace fix + plugin working

- Moved agents/ and commands/ from .claude-plugin/ to repo root (plugin path resolution)
- Added .claude-plugin/marketplace.json for /plugin marketplace add
- Plugin install verified working: /plugin marketplace add Laurentcadieux/oh-my-UiPath + /plugin install oh-my-uipath-h@oh-my-uipath

## 2026-11-01T14:43:00Z — npm publish successful: oh-my-uipath-h@1.1.2

- Package published to npm after resolving staging issues (2FA bypass on npm account)
- npm page: https://www.npmjs.com/package/oh-my-uipath-h
- Install: npm install -g oh-my-uipath-h

## 2026-11-01T14:21:00Z — CLI renamed to omu-h + setup command added

- package.json bin: omu → omu-h
- Added `omu-h setup` command (checks uip CLI, skills count, auth status)
- CLI name in program.name: omu → omu-h
- All docs updated to use omu-h

## 2026-10-31T18:24:43Z — Project scaffold created
Initial scaffold of the oh-my-UiPath multi-agent orchestration system.

- `package.json`, `tsconfig.json`, `.gitignore` — project config
- `src/types.ts`, `src/config.ts` — shared types and `uip` runner
- `src/agents/{orchestrator,solution-builder,case-architect,deployment-manager,quality-gate,index}.ts` — 5 agents + registry
- `src/workflows/{autopilot,build,deploy,index}.ts` — 3 workflows + registry
- `src/skills/{skill-loader,index}.ts` — wraps the 27 UiPath skills from the catalog
- `src/cli.ts`, `src/index.ts` — `omu` CLI + library entry point
- `README.md`, `RaceTime.md`, `memory.md` — top-level docs
- `docs/{AGENTS,WORKFLOWS,SKILLS,CLI,SDD-GUIDE}.md` — reference docs
- `templates/{sdd-template.md,case-template.json,solution-template.uipx}` — templates
- Verified: `tsc --noEmit` passes clean.
- Note: root `AGENTS.md` not written — protected-file guard denied the write; content staged for manual creation.
