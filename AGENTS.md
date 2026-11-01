# oh-my-UiPath — Agent Instructions

> Multi-agent orchestration for UiPath, powered by `uip` CLI + UiPath Skills.

## Overview

oh-my-UiPath wraps the UiPath CLI (`uip`) and 27 installed UiPath skills into a cohesive multi-agent orchestration system. Instead of manually running `uip` commands, you describe what you want and the system routes to the right agent.

## Agents

| Agent | Role | UiPath Skills Used |
|-------|------|-------------------|
| Orchestrator | Coordinates the full pipeline | uipath-platform, uipath-solution |
| Solution Builder | Builds and packs solutions | uipath-solution, uipath-rpa |
| Case Architect | Designs case management from SDDs | uipath-maestro-case, uipath-maestro-bpmn |
| Deployment Manager | Uploads, publishes, deploys | uipath-platform, uipath-governance |
| Quality Gate | Validates and tests | uipath-test, uipath-review |

## uip CLI Usage

All UiPath operations go through `runUip()` in `src/config.ts` — agents never call UiPath HTTP APIs directly and never fabricate output.

```bash
export PATH="$HOME/.npm-global/bin:$PATH"
uip --version          # verify CLI
uip login              # authenticate to UiPath Cloud
uip login status       # check auth
```

## Workflows

| Workflow | Stages | Description |
|----------|--------|-------------|
| autopilot | plan → build → validate → deploy → test | Full SDD-to-deploy pipeline |
| build | pack, validate | Build only |
| deploy | upload, publish, deploy, activate | Deploy only |

All commands support `--dry-run` and `--verbose`.

## Coding Standards

- TypeScript strict mode
- All agents use `runUip()` for CLI calls — never fabricate output
- Autopilot is fail-fast: stops on first non-zero exit
- Track all work in RaceTime.md with UTC timestamps
- Update memory.md when project state changes
- Never commit secrets (.env, tokens, machine keys)

## Tracking Files

| File | Purpose |
|------|---------|
| `RaceTime.md` | Timeline of all steps with UTC timestamps |
| `memory.md` | Agent context for context recovery after compression |

## Claude Code Plugin

oh-my-UiPath is also a Claude Code plugin. Install it in any Claude Code session:

```
/plugin marketplace add https://github.com/Laurentcadieux/oh-my-UiPath
/plugin install oh-my-uipath-h
```

Then use slash commands in chat:
- `/autopilot --sdd my-sdd.md` — full SDD-to-deploy pipeline
- `/build --solution MySolution` — pack + validate
- `/deploy --package MySolution` — upload + publish + deploy + activate

The 5 agents (orchestrator, solution-builder, case-architect, deployment-manager, quality-gate) are registered as Claude Code agents and activate automatically based on the slash command used.