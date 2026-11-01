# oh-my-UiPath

> Multi-agent orchestration for the **UiPath platform**, powered by the `uip` CLI and the 27 installed UiPath skills.

`oh-my-UiPath` (the `omu` command) wraps the [UiPath CLI (`uip`)](https://github.com/UiPath/uipathcli) and the [27 UiPath skills](https://github.com/uipath/skills) into a single cohesive orchestration system. Instead of memorising `uip` subcommands and remembering which skill owns which surface, you describe what you want — in natural language or via a CLI command — and `omu` routes the request to the right specialized **agent**, which drives the right **UiPath skill** and the right **`uip` command**.

## Inspiration

This project is directly inspired by [oh-my-claudecode](https://github.com/yeachan-heo/oh-my-claudecode) — a multi-agent orchestration layer for Claude Code with specialized agents, slash commands, skills, and workflows. `oh-my-UiPath` applies the same idea to the **UiPath platform**:

| oh-my-claudecode (Claude Code) | oh-my-UiPath (UiPath) |
| --- | --- |
| Claude Code agents | UiPath agents (`orchestrator`, `solution-builder`, …) |
| Slash commands | `omu` CLI commands + workflows |
| Skills for coding tools | The 27 installed UiPath skills |
| Code-edit pipeline | **SDD-to-deploy pipeline** (plan → build → validate → deploy → test) |

It also borrows the reverse-engineering-first mindset of [rea](https://github.com/morluto/rea): understand the platform surface before automating it.

## What it is

A thin orchestration layer that sits **on top of** two things you already have installed:

1. The `uip` CLI — the TypeScript CLI for the UiPath platform (`~/.npm-global/bin/uip`, v1.202.1).
2. The 27 UiPath skills — at `~/.agents/skills/` — each skill documents a slice of the UiPath platform.

`omu` does **not** reimplement UiPath. It maps **intent → agent → skill → `uip` command**, executes the `uip` command, and returns a structured result. Nothing is fabricated: every agent action shells out to the real `uip` binary.

## Quick start

```bash
# 1. Install the uip CLI (if not already installed)
npm install -g @uipath/cli

# 2. Install the 27 UiPath skills
uip skills install

# 3. Install oh-my-UiPath (published on npm)
npm install -g oh-my-uipath

# 4. Authenticate to UiPath Cloud
uip login

# 5. Use it
omu --help
omu agents
omu skills
omu workflows
omu autopilot --sdd ./sdd.md --dry-run
```

### From source (alternative)

```bash
git clone https://github.com/Laurentcadieux/oh-my-UiPath.git
cd oh-my-UiPath
npm install
npm run build
npm link
omu --help
```

## Features

- **Specialized agents** — `orchestrator`, `solution-builder`, `case-architect`, `deployment-manager`, `quality-gate`. Each owns a slice of the UiPath platform and a set of `uip` commands. See [`docs/AGENTS.md`](docs/AGENTS.md).
- **Workflow commands** — composable pipelines that chain agents: `build`, `deploy`, and the full `autopilot` SDD-to-deploy pipeline. See [`docs/WORKFLOWS.md`](docs/WORKFLOWS.md).
- **Skills integration** — the 27 installed UiPath skills are loaded from the catalog and bound to agents. See [`docs/SKILLS.md`](docs/SKILLS.md).
- **SDD-to-deploy pipeline** — describe a Solution Design Document, get a planned → built → validated → deployed → tested automation. See [`docs/SDD-GUIDE.md`](docs/SDD-GUIDE.md) and [`templates/sdd-template.md`](templates/sdd-template.md).
- **CLI** — a single `omu` command surface. See [`docs/CLI.md`](docs/CLI.md).
- **Dry-run & verbose** — every command supports `--dry-run` and `--verbose` so you can preview the `uip` calls before they execute.

## The 27 UiPath skills

`uipath-admin`, `uipath-agents`, `uipath-aops`, `uipath-api-workflow`, `uipath-automation-discovery`, `uipath-automationhub`, `uipath-coded-apps`, `uipath-connector-builder`, `uipath-feedback`, `uipath-functions`, `uipath-governance`, `uipath-human-in-the-loop`, `uipath-insights`, `uipath-ixp`, `uipath-maestro-bpmn`, `uipath-maestro-case`, `uipath-maestro-flow`, `uipath-mcp-servers`, `uipath-planner`, `uipath-platform`, `uipath-process-mining`, `uipath-review`, `uipath-rpa`, `uipath-skill-catalog`, `uipath-solution`, `uipath-tasks`, `uipath-test`.

Full descriptions and agent mappings: [`docs/SKILLS.md`](docs/SKILLS.md).

## Project layout

```
oh-my-UiPath/
├── README.md            # this file
├── AGENTS.md            # agent instructions (read by coding agents in this repo)
├── RaceTime.md          # timeline / changelog tracking
├── memory.md            # agent context recovery notes
├── package.json
├── tsconfig.json
├── src/
│   ├── agents/          # orchestrator, solution-builder, case-architect, deployment-manager, quality-gate
│   ├── workflows/       # autopilot, build, deploy
│   ├── skills/          # skill-loader wrapping the 27 UiPath skills
│   ├── cli.ts           # omu CLI entry point (commander.js)
│   ├── config.ts        # config + uip runner
│   ├── types.ts         # shared TypeScript types
│   └── index.ts         # library entry point
├── docs/                # AGENTS, WORKFLOWS, SKILLS, CLI, SDD-GUIDE
└── templates/           # sdd-template.md, case-template.json, solution-template.uipx
```

## Status

Published on [npm](https://www.npmjs.com/package/oh-my-uipath). Source on [GitHub](https://github.com/Laurentcadieux/oh-my-UiPath).

## License

MIT — © Laurent Cadieux.
