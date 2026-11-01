# oh-my-UiPath

> ⚠️ **Disclaimer — Research Only.** Not affiliated with UiPath. This is an independent helper; UiPath names and feeds are referenced only for compatibility. No warranty — you use this software at your own risk. The authors are not liable for damage, data loss, or compliance issues. You are responsible for license terms of each package and for organizational policies.

## Why omu-h? — Value over the upstream UiPath skills

The upstream [UiPath skills](https://github.com/UiPath/skills) give you per-product knowledge: each skill knows its own surface (`uipath-planner` for PDD/SDD → tasks, `uipath-solution` for `.uipx` lifecycle, `uipath-review` for validation, `uipath-troubleshoot` for diagnosis). But they don't chain — there is no upstream mechanism that:

- **Reverse-engineers anything into a UiPath solution** — the REA-UiPath agent (inspired by [REA](https://github.com/morluto/rea)) takes **ANY** existing system — a Python script, shell script, Excel macro, BPMN from another platform, a manual process description, an API integration — inspects it, documents it as a PDD, maps it to the right UiPath products (RPA, Maestro, Functions, Agents, API Workflows), scaffolds a `.uipx` solution, **and produces a Coded App (React/TypeScript) as the end-user presentation layer** — all from `omu-h rea <inputPath>`. Upstream has no equivalent: `uipath-planner` starts from a PDD you already wrote; REA-UiPath writes the PDD for you from any source. *(tests: `test/rea-uipath.test.ts` — 7 cases covering dry-run, happy path, failure, directory, non-existent path, BPMN mapping)*

<details>
<summary><b>How it works — REA-UiPath</b></summary>

**3 steps, one command:**

```bash
omu-h rea ./legacy-script.py
```

1. **Inspect** — reads your input (script, BPMN, macro, process description, directory) and classifies it
2. **Document & map** — writes a PDD (`pdd.md`) and maps it to the right UiPath product (RPA, Maestro Case/Flow/BPMN, Functions, Agents, API Workflows)
3. **Scaffold** — creates the `.uipx` solution, `caseplan.json` (if Maestro Case), and a **Coded App** (React/TypeScript) as the end-user frontend

**What you get:**
- `pdd.md` — Process Design Document
- `.uipx` solution (via `uip solution init`)
- `caseplan.json` (if mapped to Maestro Case)
- `{name}-app/` — Coded App with `vite.config.ts` (`base: './'`) + `src/uipath.ts` (`@uipath/uipath-typescript` SDK)

**Input → UiPath product:**

| Input | Automation | + Coded App |
|-------|-----------|-------------|
| Python / Shell / PowerShell | RPA, Functions | ✅ |
| BPMN | Maestro BPMN | ✅ |
| Text / YAML (process description) | Maestro Case, Flow | ✅ |
| JSON (API / agent) | API Workflows, Agents | ✅ |
| Directory | Multi-project Solution | ✅ |

</details>
- **Blocks dangerous mutations on Prod** — a Claude Code `PreToolUse` hook (`hooks/safety-guard.mjs`) intercepts every Bash command containing a `uip` invocation, classifies it as READ_ONLY / AUTHORING / MUTATING, and **blocks MUTATING commands on Prod tenants** (exit 2). Fail-closed: unknown tenant also blocks. Configurable via `OMU_PROD_TENANT_PATTERN` and `.omu.json`. Bypass with `OMU_ALLOW_PROD_MUTATIONS=1`. *(tests: `test/safety-guard.test.ts` — 30+ cases covering Prod, Production, prod-eu, empty tenant, chained commands, npx, absolute paths, bypass)*
- **Gates on skill maturity** — the hook also blocks MUTATING commands driven by Preview or In-development skills on Prod, even with the prod bypass, unless `OMU_ALLOW_PREVIEW=1`. Unknown skill status is treated as blocked, not allowed. *(tests: `test/safety-guard.test.ts` — 5 skill-maturity cases; `test/skill-status.test.ts` — 10 cases)*
- **Validates before deploy** — the reviewer agent runs `uip rpa validate` + `uip rpa build` + `uip maestro case validate`, parses the JSON output for real severity (Critical / Warning / Info), and **gates the pipeline on Critical findings**. *(tests: `test/phase2-agents.test.ts` — reviewer suite with 6 cases including failure paths)*
- **Diagnoses failures** — the diagnostician agent uses the failure output (`ctx.labels['failed-output']`) to run targeted `uip or jobs logs/get` for job IDs found in the error, and `uip solution deploy status` for deploy failures. *(tests: `test/phase2-agents.test.ts` — diagnostician suite)*
- **Recommends recovery** — the recovery engine classifies failures (AUTHORING vs TENANT) and prints a recommended `uip` command. **Never auto-applies** — the user reviews and runs the fix manually. *(tests: `test/phase4.test.ts` — 7 recovery cases)*
- **Rolls back** — before each deploy, `recordPreDeployVersions` snapshots all process keys + versions to `.omu-versions.json`. `omu-h rollback <env>` restores them via `uip or processes rollback <key>`. *(tests: `test/phase4.test.ts` — 4 rollback cases)*
- **Promotes across environments** — `omu-h promote <from> <to>` checks gates (validation passed, no Critical findings, test pass rate ≥ threshold) and requires `--confirm` for prod. *(tests: `test/phase4.test.ts` — 6 promotion cases)*

### Relationship to upstream

**What `uipath-planner` already does:** PDD → SDD authoring, task derivation, specialist routing. The upstream planner is the source of truth for solution design — omu-h does not duplicate it.

**What omu-h adds:** deterministic guardrails around the upstream skills — **REA-UiPath** (reverse-engineer anything → UiPath with a Coded App frontend), a safety hook that blocks mutations on Prod, skill maturity gating, a review gate before deploy, failure diagnosis, recovery recommendations, rollback, and environment promotion. The pipeline (`plan → review → deploy → test`) operates on existing artifacts produced by upstream skills, not on artifacts it creates itself.

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
/plugin marketplace add Laurentcadieux/oh-my-UiPath-h
```

Wait for "marketplace added", then:

```
/plugin install oh-my-uipath-h@oh-my-uipath-h
```

### Use it

After install, the slash commands are available in any Claude Code session:

- `/autopilot` — runs the full pipeline (`plan → review → deploy → test`)
- `/build` — validates existing artifacts (reviewer)
- `/deploy` — publishes and deploys the solution, then verifies

The 5 agents (`orchestrator`, `reviewer`, `quality-gate`, `deployment-manager`, `diagnostician`) are also available for direct delegation.

## Features

- **Safety hook** — a Claude Code `PreToolUse` hook that blocks MUTATING `uip` commands on Prod tenants. See [`hooks/safety-guard.mjs`](hooks/safety-guard.mjs).
- **Skill maturity gating** — blocks Preview/In-development skills on Prod. See [`src/skill-status.ts`](src/skill-status.ts).
- **Review gate** — the reviewer agent runs `uip rpa validate` + `uip rpa build` + `uip maestro case validate`, parses severity, and gates on Critical findings. See [`src/agents/reviewer.ts`](src/agents/reviewer.ts).
- **Failure diagnosis** — the diagnostician uses failure output to run targeted `uip` diagnostics. See [`src/agents/diagnostician.ts`](src/agents/diagnostician.ts).
- **Recovery recommendations** — classifies failures and recommends `uip` commands (never auto-applies). See [`src/engine/recovery.ts`](src/engine/recovery.ts).
- **Rollback** — records pre-deploy process versions and restores them via `uip or processes rollback`. See [`src/engine/rollback.ts`](src/engine/rollback.ts).
- **Environment promotion** — `dev → test → prod` with gates and `--confirm` for prod. See [`src/engine/environments.ts`](src/engine/environments.ts).
- **`setup` command** — `omu-h setup` checks all prerequisites (uip CLI, skills, auth) in one command.
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
├── test/                     # fake-uip + 123 tests across 33 suites
├── docs/                     # UIP-COMMANDS, agents-reference, WORKFLOWS, SKILLS, CLI, SDD-GUIDE
└── templates/                # sdd-template.md, .omu-env.json
```

## Status

Published on [npm](https://www.npmjs.com/package/oh-my-uipath-h) as `oh-my-uipath-h`. Source on [GitHub](https://github.com/Laurentcadieux/oh-my-UiPath).

## License

MIT — © Laurent Cadieux.