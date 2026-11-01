# oh-my-UiPath

> ⚠️ **Disclaimer — Research Only.** Not affiliated with UiPath. This is an independent helper; UiPath names and feeds are referenced only for compatibility. No warranty — you use this software at your own risk. The authors are not liable for damage, data loss, or compliance issues. You are responsible for license terms of each package and for organizational policies.

## Why omu-h? — Value over the upstream UiPath skills

The upstream [UiPath skills](https://github.com/UiPath/skills) give you per-product knowledge: each skill knows its own surface (`uipath-planner` for PDD/SDD → tasks, `uipath-solution` for `.uipx` lifecycle, `uipath-review` for validation, `uipath-troubleshoot` for diagnosis). But they don't chain — there is no upstream mechanism that:

- **Blocks dangerous mutations on Prod** — a Claude Code `PreToolUse` hook (`hooks/safety-guard.mjs`) intercepts every Bash command containing a `uip` invocation, classifies it as READ_ONLY / AUTHORING / MUTATING, and **blocks MUTATING commands on Prod tenants** (exit 2). Fail-closed: unknown tenant also blocks. Configurable via `OMU_PROD_TENANT_PATTERN` and `.omu.json`. Bypass with `OMU_ALLOW_PROD_MUTATIONS=1`. *(tests: `test/safety-guard.test.ts` — 30+ cases covering Prod, Production, prod-eu, empty tenant, chained commands, npx, absolute paths, bypass)*
- **Gates on skill maturity** — the hook also blocks MUTATING commands driven by Preview or In-development skills on Prod, even with the prod bypass, unless `OMU_ALLOW_PREVIEW=1`. Unknown skill status is treated as blocked, not allowed. *(tests: `test/safety-guard.test.ts` — 5 skill-maturity cases; `test/skill-status.test.ts` — 10 cases)*
- **Validates before deploy** — the reviewer agent runs `uip rpa validate` + `uip rpa build` + `uip maestro case validate`, parses the JSON output for real severity (Critical / Warning / Info), and **gates the pipeline on Critical findings**. *(tests: `test/phase2-agents.test.ts` — reviewer suite with 6 cases including failure paths)*
- **Diagnoses failures** — the diagnostician agent uses the failure output (`ctx.labels['failed-output']`) to run targeted `uip or jobs logs/get` for job IDs found in the error, and `uip solution deploy status` for deploy failures. *(tests: `test/phase2-agents.test.ts` — diagnostician suite)*
- **Recommends recovery** — the recovery engine classifies failures (AUTHORING vs TENANT) and prints a recommended `uip` command. **Never auto-applies** — the user reviews and runs the fix manually. *(tests: `test/phase4.test.ts` — 7 recovery cases)*
- **Rolls back** — before each deploy, `recordPreDeployVersions` snapshots all process keys + versions to `.omu-versions.json`. `omu-h rollback <env>` restores them via `uip or processes rollback <key>`. *(tests: `test/phase4.test.ts` — 4 rollback cases)*
- **Promotes across environments** — `omu-h promote <from> <to>` checks gates (validation passed, no Critical findings, test pass rate ≥ threshold) and requires `--confirm` for prod. *(tests: `test/phase4.test.ts` — 6 promotion cases)*

### Relationship to upstream

**What `uipath-planner` already does:** PDD → SDD authoring, task derivation, specialist routing. The upstream planner is the source of truth for solution design — omu-h does not duplicate it.

**What omu-h adds:** deterministic guardrails around the upstream skills — a safety hook that blocks mutations on Prod, skill maturity gating, a review gate before deploy, failure diagnosis, recovery recommendations, rollback, and environment promotion. The pipeline (`plan → review → deploy → test`) operates on existing artifacts produced by upstream skills, not on artifacts it creates itself.

> Multi-agent orchestration for the **UiPath platform**, powered by the `uip` CLI and the installed UiPath skills. Run `omu-h setup` to see how many skills are installed.

`oh-my-UiPath` (the `omu-h` command) wraps the [UiPath CLI (`uip`)](https://github.com/UiPath/uipathcli) and the installed [UiPath skills](https://github.com/UiPath/skills) into a single cohesive orchestration system. Instead of memorising `uip` subcommands and remembering which skill owns which surface, you describe what you want — in natural language or via a CLI command — and `omu-h` routes the request to the right specialized **agent**, which drives the right **UiPath skill** and the right **`uip` command**.

## Prerequisites

| Requirement | Minimum | Install |
|-------------|---------|---------|
| **Node.js** | 22+ | `curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo -E bash -` then `sudo apt install -y nodejs` |
| **UiPath CLI (`uip`)** | 1.197+ | `npm install -g @uipath/cli` |
| **UiPath Skills** | Latest | `uip skills install` (run inside a coding agent session like Claude Code) |
| **UiPath Cloud account** | Any tenant | `uip login` (browser-based OAuth) |
| **Claude Code** (for plugin/interactive) | Latest | `curl -fsSL https://claude.ai/install.sh \| bash` |
| **OS** | Ubuntu 20.04+ / macOS / Windows | — |

## Inspiration

This project is directly inspired by [oh-my-claudecode](https://github.com/yeachan-heo/oh-my-claudecode) — a multi-agent orchestration layer for Claude Code with specialized agents, slash commands, skills, and workflows. `oh-my-UiPath` applies the same idea to the **UiPath platform**:

| oh-my-claudecode (Claude Code) | oh-my-UiPath (UiPath) |
| --- | --- |
| Claude Code agents | UiPath agents (`orchestrator`, `solution-builder`, …) |
| Slash commands | `omu-h` CLI commands + workflows |
| Skills for coding tools | The installed UiPath skills |
| Code-edit pipeline | **SDD-to-deploy pipeline** (plan → build → validate → deploy → test) |

It also borrows the reverse-engineering-first mindset of [rea](https://github.com/morluto/rea): understand the platform surface before automating it.

## What it is

A thin orchestration layer that sits **on top of** two things you already have installed:

1. The `uip` CLI — the TypeScript CLI for the UiPath platform (`~/.npm-global/bin/uip`, v1.202.1+).
2. The installed UiPath skills — at `~/.agents/skills/` — each skill documents a slice of the UiPath platform.

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

### Step 3: Install the installed UiPath skills

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
✓ UiPath skills: installed
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
- **Skills integration** — installed UiPath skills loaded from the catalog and bound to agents. See [`docs/SKILLS.md`](docs/SKILLS.md).
- **SDD-to-deploy pipeline** — describe a Solution Design Document, get a planned → built → validated → deployed → tested automation. See [`docs/SDD-GUIDE.md`](docs/SDD-GUIDE.md) and [`templates/sdd-template.md`](templates/sdd-template.md).
- **CLI** — a single `omu-h` command surface. See [`docs/CLI.md`](docs/CLI.md).
- **Dry-run & verbose** — every command supports `--dry-run` and `--verbose`.
- **`setup` command** — `omu-h setup` checks all prerequisites (uip CLI, skills, auth) in one command.

## The installed UiPath skills

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
│   ├── skills/               # skill-loader wrapping the installed UiPath skills
│   ├── cli.ts                # omu-h CLI entry point (commander.js)
│   ├── config.ts             # config + uip runner
│   ├── types.ts              # shared TypeScript types
│   └── index.ts              # library entry point
├── docs/                     # agents-reference, WORKFLOWS, SKILLS, CLI, SDD-GUIDE
└── templates/                # sdd-template.md, case-template.json, solution-template.uipx
```

## Status

Published on [npm](https://www.npmjs.com/package/oh-my-uipath-h) as `oh-my-uipath-h`. Source on [GitHub](https://github.com/Laurentcadieux/oh-my-UiPath).

## Disclaimer — Research Only

> **This is a research project, not an official UiPath product.**

- **Not affiliated with UiPath.** This is an independent helper; UiPath names and feeds are referenced only for compatibility.
- **No warranty.** You use this software at your own risk. The authors are not liable for damage, data loss, compliance issues, or failed restores.
- **Network and licensing.** Downloads require outbound HTTPS to the feeds you use. You are responsible for license terms of each package and for organizational policies (proxy, firewall, export control, etc.).
- **Resolution is heuristic.** Version selection uses a lowest matching version strategy per dependency edge. It is not a full NuGet graph solver; results may differ from Visual Studio or dotnet restore.
- **Authenticated feeds** (private Azure Artifacts with PAT, etc.) are not built in; only anonymous NuGet v3 sources work unless you extend the code.

## License

MIT — © Laurent Cadieux.