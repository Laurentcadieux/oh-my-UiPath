# oh-my-UiPath

> Multi-agent orchestration for the **UiPath platform**, powered by the `uip` CLI and the 27 installed UiPath skills.

`oh-my-UiPath` (the `omu-h` command) wraps the [UiPath CLI (`uip`)](https://github.com/UiPath/uipathcli) and the [27 UiPath skills](https://github.com/uipath/skills) into a single cohesive orchestration system. Instead of memorising `uip` subcommands and remembering which skill owns which surface, you describe what you want — in natural language or via a CLI command — and `omu-h` routes the request to the right specialized **agent**, which drives the right **UiPath skill** and the right **`uip` command**.

## Prerequisites

| Requirement | Minimum | Install |
|-------------|---------|---------|
| **Node.js** | 22+ | `curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo -E bash -` then `sudo apt install -y nodejs` |
| **UiPath CLI (`uip`)** | 1.197+ | `npm install -g @uipath/cli` |
| **UiPath Skills** | 27 skills | `uip skills install` (run inside a coding agent session like Claude Code) |
| **UiPath Cloud account** | Any tenant | `uip login` (browser-based OAuth) |
| **Claude Code** (for plugin/interactive) | Latest | `curl -fsSL https://claude.ai/install.sh \| bash` |
| **OS** | Ubuntu 20.04+ / macOS / Windows | — |

## Inspiration

This project is directly inspired by [oh-my-claudecode](https://github.com/yeachan-heo/oh-my-claudecode) — a multi-agent orchestration layer for Claude Code with specialized agents, slash commands, skills, and workflows. `oh-my-UiPath` applies the same idea to the **UiPath platform**:

| oh-my-claudecode (Claude Code) | oh-my-UiPath (UiPath) |
| --- | --- |
| Claude Code agents | UiPath agents (`orchestrator`, `solution-builder`, …) |
| Slash commands | `omu-h` CLI commands + workflows |
| Skills for coding tools | The 27 installed UiPath skills |
| Code-edit pipeline | **SDD-to-deploy pipeline** (plan → build → validate → deploy → test) |

It also borrows the reverse-engineering-first mindset of [rea](https://github.com/morluto/rea): understand the platform surface before automating it.

## What it is

A thin orchestration layer that sits **on top of** two things you already have installed:

1. The `uip` CLI — the TypeScript CLI for the UiPath platform (`~/.npm-global/bin/uip`, v1.202.1+).
2. The 27 UiPath skills — at `~/.agents/skills/` — each skill documents a slice of the UiPath platform.

`omu-h` does **not** reimplement UiPath. It maps **intent → agent → skill → `uip` command**, executes the `uip` command, and returns a structured result. Nothing is fabricated: every agent action shells out to the real `uip` binary.

## Setup

### Step 1: Install Node.js 22+

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version    # should print v22.x
```

### Step 2: Install the uip CLI

```bash
npm install -g @uipath/cli
uip --version     # should print 1.197+
```

### Step 3: Install the 27 UiPath skills

> **Note:** `uip skills install` must be run inside a coding agent session (e.g. Claude Code). It detects the agent and installs skills into its skill directory.

```bash
# Start Claude Code
claude

# Inside Claude Code:
uip skills install
```

### Step 4: Install oh-my-UiPath

```bash
npm install -g oh-my-uipath-h
```

### Step 5: Authenticate to UiPath Cloud

```bash
uip login         # opens browser for OAuth login
uip login status   # verify: should say "Logged in"
```

### Step 6: Verify setup

```bash
omu-h setup
```

Expected output:
```
oh-my-UiPath Setup

✓ uip CLI: 1.202.1 (/path/to/uip)
✓ UiPath skills: 27 installed
✓ uip login: authenticated

Commands: omu-h agents | omu-h skills | omu-h workflows | omu-h autopilot --sdd ./sdd.md --dry-run
```

### Step 7: Use it

```bash
omu-h --help
omu-h agents
omu-h skills
omu-h workflows
omu-h autopilot --sdd ./sdd.md --dry-run
```

### From source (alternative)

```bash
git clone https://github.com/Laurentcadieux/oh-my-UiPath.git
cd oh-my-UiPath
npm install
npm run build
npm link
omu-h --help
```

## Claude Code Plugin

`oh-my-UiPath` is also a **Claude Code plugin** (like [oh-my-claudecode](https://github.com/yeachan-heo/oh-my-claudecode)). The `.claude-plugin/` directory registers the 5 agents and 3 slash commands so you can drive the SDD-to-deploy pipeline from inside a Claude Code chat session.

### Install as a plugin

In a Claude Code session, run these **one at a time** (not on the same line):

```
/plugin marketplace add Laurentcadieux/oh-my-UiPath
```

Wait for "marketplace added", then:

```
/plugin install oh-my-uipath-h@oh-my-uipath
```

### Use it

After install, the slash commands are available in any Claude Code session:

- `/autopilot` — runs the full SDD-to-deploy pipeline (`plan → case → build → validate → deploy → test`)
- `/build` — packs and validates the solution
- `/deploy` — uploads, publishes, deploys, and activates

The 5 agents (`orchestrator`, `solution-builder`, `case-architect`, `deployment-manager`, `quality-gate`) are also available for direct delegation.

## Features

- **Specialized agents** — `orchestrator`, `solution-builder`, `case-architect`, `deployment-manager`, `quality-gate`. See [`docs/agents-reference.md`](docs/agents-reference.md).
- **Workflow commands** — composable pipelines: `build`, `deploy`, and the full `autopilot` SDD-to-deploy pipeline. See [`docs/WORKFLOWS.md`](docs/WORKFLOWS.md).
- **Skills integration** — 27 UiPath skills loaded from the catalog and bound to agents. See [`docs/SKILLS.md`](docs/SKILLS.md).
- **SDD-to-deploy pipeline** — describe a Solution Design Document, get a planned → built → validated → deployed → tested automation. See [`docs/SDD-GUIDE.md`](docs/SDD-GUIDE.md) and [`templates/sdd-template.md`](templates/sdd-template.md).
- **CLI** — a single `omu-h` command surface. See [`docs/CLI.md`](docs/CLI.md).
- **Dry-run & verbose** — every command supports `--dry-run` and `--verbose`.
- **`setup` command** — `omu-h setup` checks all prerequisites (uip CLI, skills, auth) in one command.

## The 27 UiPath skills

`uipath-admin`, `uipath-agents`, `uipath-aops`, `uipath-api-workflow`, `uipath-automation-discovery`, `uipath-automationhub`, `uipath-coded-apps`, `uipath-connector-builder`, `uipath-feedback`, `uipath-functions`, `uipath-governance`, `uipath-human-in-the-loop`, `uipath-insights`, `uipath-ixp`, `uipath-maestro-bpmn`, `uipath-maestro-case`, `uipath-maestro-flow`, `uipath-mcp-servers`, `uipath-planner`, `uipath-platform`, `uipath-process-mining`, `uipath-review`, `uipath-rpa`, `uipath-skill-catalog`, `uipath-solution`, `uipath-tasks`, `uipath-test`.

Full descriptions: [`docs/SKILLS.md`](docs/SKILLS.md).

## Project layout

```
oh-my-UiPath/
├── README.md
├── AGENTS.md
├── RaceTime.md
├── memory.md
├── package.json
├── tsconfig.json
├── .claude-plugin/
│   ├── plugin.json          # manifest (name, version, agents, commands)
│   └── marketplace.json     # marketplace listing
├── agents/                   # 5 agent definitions (repo root for plugin resolution)
├── commands/                 # 3 slash commands (repo root for plugin resolution)
├── src/
│   ├── agents/               # orchestrator, solution-builder, case-architect, deployment-manager, quality-gate
│   ├── workflows/            # autopilot, build, deploy
│   ├── skills/               # skill-loader wrapping the 27 UiPath skills
│   ├── cli.ts                # omu-h CLI entry point (commander.js)
│   ├── config.ts             # config + uip runner
│   ├── types.ts              # shared TypeScript types
│   └── index.ts              # library entry point
├── docs/                     # agents-reference, WORKFLOWS, SKILLS, CLI, SDD-GUIDE
└── templates/                # sdd-template.md, case-template.json, solution-template.uipx
```

## Status

Published on [npm](https://www.npmjs.com/package/oh-my-uipath-h) as `oh-my-uipath-h`. Source on [GitHub](https://github.com/Laurentcadieux/oh-my-UiPath).

## License

MIT — © Laurent Cadieux.