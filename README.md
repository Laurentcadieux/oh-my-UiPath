# oh-my-UiPath

> ⚠️ **Disclaimer — Research Only.** Not affiliated with UiPath. This is an independent helper; UiPath names and feeds are referenced only for compatibility. No warranty — you use this software at your own risk. The authors are not liable for damage, data loss, or compliance issues. You are responsible for license terms of each package and for organizational policies.

## Why omu-h?

The upstream [UiPath skills](https://github.com/UiPath/skills) are great — each one knows its surface (`uipath-planner`, `uipath-solution`, `uipath-review`, `uipath-troubleshoot`, etc.). omu-h wraps them with guardrails so you can go from idea to deployed UiPath automation safely, in one command.

**What omu-h adds:**

1. **REA-UiPath** — `omu-h rea ./anything` — reverse-engineers any existing system (script, BPMN, macro, process doc) into a UiPath solution with a Coded App frontend. Upstream needs a PDD you already wrote; REA-UiPath writes it for you.
2. **Prod guard inside `runUip`** — the single choke point. Reads the real tenant from `uip login status`, blocks MUTATING commands on Prod or unknown tenants. Not just the hook — the CLI itself is guarded.
3. **`loco` escape hatch** — `omu-h setup --prod-tenant loco` disables all guard rails for local development. No MUTATING blocking, no skill gating, no fail-closed.
4. **Safety hook** — blocks `publish`/`deploy`/`activate` on Prod tenants. Fail-closed on unknown tenant. Bypass with `OMU_ALLOW_PROD_MUTATIONS=1`.
5. **Skill maturity gating** — blocks Preview and In-development skills on Prod unless `OMU_ALLOW_PREVIEW=1`.
6. **Review before deploy** — runs `uip rpa validate` + `uip rpa build` + `uip maestro case validate`, gates on Critical findings.
7. **Failure diagnosis** — extracts job IDs from errors, runs `uip or jobs logs` + `uip solution deploy status`.
8. **Recovery recommendations** — classifies failures, prints a recommended `uip` command. Never auto-applies.
9. **Rollback** — snapshots process versions before each deploy. `omu-h rollback <env>` restores them.
10. **Environment promotion** — `omu-h promote dev test` / `omu-h promote test prod` with gates. Prod requires `--confirm`.
11. **Token ROI** — `omu-h tokens` / `omu-h roi` — tracks LLM token usage per agent and per stage, with cost estimate.

### Relationship to upstream

**`uipath-planner` already does:** PDD → SDD authoring, task derivation, specialist routing. omu-h does not duplicate it.

**omu-h adds:** guardrails — REA-UiPath, safety hook, maturity gating, review, diagnosis, recovery, rollback, promotion, and token ROI. The pipeline (`plan → review → deploy → test`) operates on existing artifacts, not on artifacts it creates itself.

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

### Step 3: Install the UiPath skills

> **Note:** `uip skills install` must be run inside a coding agent session (e.g. Claude Code). It detects the agent and installs skills into its skill directory.

```bash
# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Start Claude Code
claude

# Inside Claude Code:
uip skills install
```

### Step 4: Install oh-my-UiPath

```bash
npm install -g oh-my-uipath-h@latest
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

### Step 7: Install as a Claude Code plugin

In a Claude Code session, run these **one at a time**:

```
/plugin marketplace add Laurentcadieux/oh-my-UiPath
```

Wait for "marketplace added", then:

```
/plugin install oh-my-uipath-h@oh-my-uipath
```

After install, the slash commands are available in any Claude Code session:

- `/autopilot` — runs the full pipeline (`plan → review → deploy → test`)
- `/build` — validates existing artifacts (reviewer)
- `/deploy` — publishes and deploys the solution, then verifies

### Step 8: Use it from the CLI

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

After install (Step 7), the 6 agents (`orchestrator`, `reviewer`, `quality-gate`, `deployment-manager`, `diagnostician`, `rea-uipath`) and 3 slash commands (`/autopilot`, `/build`, `/deploy`) are available for direct delegation in any Claude Code session.

## Features

- **REA-UiPath** — `omu-h rea <input>` reverse-engineers any existing system (script, BPMN, macro, process doc) into a UiPath solution with a Coded App frontend. See [`src/agents/rea-uipath.ts`](src/agents/rea-uipath.ts).
- **Prod guard inside `runUip`** — the CLI's own `uip` runner reads the real tenant from `uip login status` and blocks MUTATING commands on Prod or unknown tenants. The guard lives in the single choke point, not just the hook. See [`src/config.ts`](src/config.ts) + [`src/safety.ts`](src/safety.ts).
- **`loco` escape hatch** — `omu-h setup --prod-tenant loco` disables all guard rails for local development. Every command is allowed, no classification, no gating.
- **Safety hook** — a Claude Code `PreToolUse` hook that blocks MUTATING `uip` commands on Prod tenants. See [`hooks/safety-guard.mjs`](hooks/safety-guard.mjs).
- **Skill maturity gating** — blocks Preview/In-development skills on Prod. See [`src/skill-status.ts`](src/skill-status.ts).
- **Review gate** — the reviewer agent runs `uip rpa validate` + `uip rpa build` + `uip maestro case validate`, parses severity, and gates on Critical findings. See [`src/agents/reviewer.ts`](src/agents/reviewer.ts).
- **Failure diagnosis** — the diagnostician uses failure output to run targeted `uip` diagnostics. See [`src/agents/diagnostician.ts`](src/agents/diagnostician.ts).
- **Recovery recommendations** — classifies failures and recommends `uip` commands (never auto-applies). See [`src/engine/recovery.ts`](src/engine/recovery.ts).
- **Rollback** — records pre-deploy process versions and restores them via `uip or processes rollback`. See [`src/engine/rollback.ts`](src/engine/rollback.ts).
- **Environment promotion** — `dev → test → prod` with gates and `--confirm` for prod. See [`src/engine/environments.ts`](src/engine/environments.ts).
- **Token ROI** — `omu-h tokens` / `omu-h roi` tracks LLM token usage per agent and per stage, with cost estimate. See [`src/token-tracker.ts`](src/token-tracker.ts).
- **`setup` command** — `omu-h setup` checks all prerequisites (uip CLI, skills, auth) and configures the Prod guard pattern. `--prod-tenant <name>` writes to `.omu.json`.
- **`sync` command** — `omu-h sync` reports skill maturity (Stable / Preview / In-development) from upstream.
- **Dry-run & verbose** — every command supports `--dry-run` and `--verbose`.

## The installed UiPath skills

Run `omu-h skills` or `uip skills list` to see the full list of installed skills and their descriptions. `omu-h setup` reports the count. The skill catalog is read dynamically from `~/.agents/skills/skills.catalog.json` — no hardcoded list.

## Project layout

```
oh-my-UiPath/
├── README.md
├── LICENSE
├── package.json
├── tsconfig.json
├── .claude-plugin/
│   ├── plugin.json          # manifest (name, version, agents, commands, hooks)
│   ├── marketplace.json     # marketplace listing
│   └── icon.png             # 512×512 plugin icon
├── agents/                   # agent definitions (for Claude Code plugin)
├── commands/                 # slash command definitions
├── hooks/
│   ├── hooks.json            # PreToolUse hook manifest
│   └── safety-guard.mjs      # safety hook: blocks MUTATING uip on Prod
├── assets/
│   └── skill-status.json     # upstream skill maturity (Stable/Preview/In-development)
├── src/
│   ├── agents/               # orchestrator, reviewer, quality-gate, deployment-manager, diagnostician
│   ├── workflows/            # autopilot, build, deploy
│   ├── engine/               # recovery, rollback, environments, task-graph, worker-pool
│   ├── skills/               # skill-loader (reads catalog dynamically)
│   ├── cli.ts                # omu-h CLI (commander.js)
│   ├── config.ts             # config + uip runner
│   ├── skill-status.ts       # skill maturity loading + gating
│   ├── types.ts              # shared TypeScript types
│   └── index.ts              # library entry point
├── test/                     # fake-uip + 195 tests across 47 suites
├── docs/                     # UIP-COMMANDS, agents-reference, WORKFLOWS, SKILLS, CLI, SDD-GUIDE
└── templates/                # sdd-template.md, .omu-env.json
```

## Status

Published on [npm](https://www.npmjs.com/package/oh-my-uipath-h) as `oh-my-uipath-h`. Source on [GitHub](https://github.com/Laurentcadieux/oh-my-UiPath).

## License

MIT — © Laurent Cadieux.