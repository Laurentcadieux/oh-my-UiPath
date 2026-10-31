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

## Adding an agent

1. Create `src/agents/<name>.ts` exporting an `Agent` object.
2. Register it in `src/agents/index.ts` (`agentList` + re-export).
3. Document it here and in the root `AGENTS.md`.
4. Map its skills in `docs/SKILLS.md`.
5. Optionally wire a CLI subcommand in `src/cli.ts` and a workflow step in `src/workflows/`.
