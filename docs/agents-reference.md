# docs/agents-reference.md — Agent reference

> Note: this file is named `agents-reference.md` because the protected-file guard
> denied writes to any file named `AGENTS.md`. The intended `docs/AGENTS.md`
> should be created manually with this content if desired.
>
> For the agent-instruction file that coding agents read, see the root `AGENTS.md`
> (also pending manual creation — see `memory.md`).

## Model

`intent -> agent -> skill -> uip command`

An **agent** owns a slice of the UiPath platform. It loads one or more **skills**
for context and drives a set of **`uip` commands** via the shared `runUip()`
runner (`src/config.ts`). Agents never call UiPath HTTP APIs directly and never
fabricate output — they return the real `uip` exit code, stdout, and stderr.

Every agent accepts an `AgentContext` and returns an `AgentResult`:

```ts
interface AgentContext {
  cwd: string;
  sddPath?: string;
  solutionPath?: string;
  tenant?: string;
  folder?: string;
  dryRun: boolean;
  verbose: boolean;
}
```

## The five agents

### orchestrator
- **Role:** Coordinates the full SDD-to-deploy pipeline; resolves tenant/folder context and routes to specialist agents.
- **Skills:** `uipath-platform`, `uipath-solution`, `uipath-planner`
- **`uip` commands:** `uip solution`, `uip orchestrator folders list`, `uip orchestrator`
- **Produces:** `orchestration-plan.json` (planning) and the resolved folder list.

### solution-builder
- **Role:** Scaffolds and packs UiPath solutions (`.uipx`) from the SDD-derived project list.
- **Skills:** `uipath-solution`, `uipath-rpa`
- **`uip` commands:** `uip solution init`, `uip solution restore`, `uip solution pack`, `uip rpa pack`
- **Produces:** `dist/*.uipx`.

### case-architect
- **Role:** Designs a Maestro Case Management `caseplan.json` from an SDD, then validates and packs it.
- **Skills:** `uipath-maestro-case`, `uipath-planner`
- **`uip` commands:** `uip maestro case init`, `uip maestro case validate`, `uip maestro case pack`
- **Produces:** `caseplan.json`.

### deployment-manager
- **Role:** Uploads, publishes, deploys, and activates a solution into a target tenant/folder.
- **Skills:** `uipath-solution`, `uipath-platform`
- **`uip` commands:** `uip solution upload`, `uip solution publish`, `uip solution deploy`, `uip solution activate`
- **Folder targeting:** forwards `ctx.folder` to `publish` and `deploy` when set.

### quality-gate
- **Role:** Validates and tests before and after deploy: case-plan validation, RPA static analysis, Test Manager execution.
- **Skills:** `uipath-test`, `uipath-maestro-case`, `uipath-review`
- **`uip` commands:** `uip maestro case validate`, `uip rpa analyze`, `uip test run`
- **Produces:** `quality-report.json` (best-effort).

## Claude Code plugin

`oh-my-UiPath` ships as a **Claude Code plugin** in `.claude-plugin/`. The
manifest (`.claude-plugin/plugin.json`) registers the 5 agents above and 3
slash commands so they are available inside Claude Code chat sessions.

> The root `AGENTS.md` is a protected agent-instruction file and could not be
> edited programmatically; this section documents the Claude Code plugin usage
> that was intended for it.

### Structure

```
.claude-plugin/
├── plugin.json           # manifest: name, version, agents, commands
├── agents/               # 5 Claude Code agent definitions
│   ├── orchestrator.md
│   ├── solution-builder.md
│   ├── case-architect.md
│   ├── deployment-manager.md
│   └── quality-gate.md
└── commands/             # 3 slash command definitions
    ├── autopilot.md      # /autopilot — full SDD-to-deploy pipeline
    ├── build.md          # /build      — pack + validate
    └── deploy.md         # /deploy     — upload + publish + deploy + activate
```

### Install in Claude Code

```bash
/plugin marketplace add https://github.com/Laurentcadieux/oh-my-UiPath
/plugin install oh-my-uipath-h
```

### Usage

After install, the slash commands are available in any Claude Code session:

- `/autopilot` — runs the full SDD-to-deploy pipeline
  (`plan -> case -> build -> validate -> deploy -> test`), equivalent to
  `omu-h autopilot`.
- `/build` — packs and validates the solution, equivalent to `omu-h build`.
- `/deploy` — uploads, publishes, deploys, and activates, equivalent to
  `omu-h deploy`.

The agents (`orchestrator`, `solution-builder`, `case-architect`,
`deployment-manager`, `quality-gate`) are also available for direct delegation.

### How the plugin maps to `omu`

| Claude Code surface | `omu` equivalent | Agents invoked |
| --- | --- | --- |
| `/autopilot` | `omu-h autopilot` | orchestrator → case-architect → solution-builder → quality-gate → deployment-manager → quality-gate |
| `/build` | `omu-h build` | solution-builder → quality-gate |
| `/deploy` | `omu-h deploy` | deployment-manager → quality-gate |

The agents load the 27 UiPath skills from `~/.agents/skills/` for context and
drive `uip` commands via `runUip()` — exactly like the `omu` CLI. Nothing is
fabricated: every action shells out to the real `uip` binary.

## Adding an agent

1. Create `src/agents/<name>.ts` exporting an `Agent` object.
2. Register it in `src/agents/index.ts` (`agentList` + re-export).
3. Document it here and in the root `AGENTS.md`.
4. Map its skills in `docs/SKILLS.md`.
5. Optionally wire a CLI subcommand in `src/cli.ts` and a workflow step in `src/workflows/`.
