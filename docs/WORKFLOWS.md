# docs/WORKFLOWS.md — Workflow reference

A **workflow** chains agents into a pipeline. Each workflow has a `steps` list (for documentation/introspection) and a `run(ctx)` that executes the agents in order and returns an `AgentResult[]`.

## Workflows

### autopilot — full SDD-to-deploy pipeline
The headline workflow. `plan -> build -> validate -> deploy -> test`.

| Step | Agent | Description |
| --- | --- | --- |
| plan | orchestrator | Resolve context and plan the pipeline |
| case | case-architect | Design + validate `caseplan.json` from SDD |
| build | solution-builder | Init, restore, pack `.uipx` |
| validate | quality-gate | Case validate, RPA analyze, tests |
| deploy | deployment-manager | Upload, publish, deploy, activate |
| test | quality-gate | Post-deploy verification + tests |

**Fail-fast:** the pipeline stops on the first agent whose `uip` calls exit non-zero.

```bash
omu-h autopilot --sdd ./sdd.md --dry-run
omu-h autopilot --sdd ./sdd.md --folder MyFolder
```

### build — pack + validate
Two steps: `solution-builder` (pack) then `quality-gate` (validate).

```bash
omu-h build --dry-run
omu-h build --verbose
```

### deploy — upload + publish + deploy + activate
Two steps: `deployment-manager` (upload/publish/deploy/activate) then a `quality-gate` verification pass.

```bash
omu-h deploy --solution ./dist --folder MyFolder
```

## Running workflows

- `omu-h autopilot` / `omu-h build` / `omu-h deploy` — convenience commands.
- `omu-h run <workflow>` — run any registered workflow by name.
- `omu-h workflows` — list all registered workflows and their steps.

## Adding a workflow

1. Create `src/workflows/<name>.ts` exporting a `Workflow`.
2. Register it in `src/workflows/index.ts` (`workflowList` + re-export).
3. Document it here.
4. Optionally add a convenience CLI subcommand in `src/cli.ts`.

## Shared options

Every workflow/agent command supports:

| Option | Effect |
| --- | --- |
| `--sdd <path>` | Path to the SDD (used by `case-architect`, `orchestrator`). |
| `--solution <path>` | Path to the `.uipx` solution or solution root. |
| `--tenant <name>` | Target tenant. |
| `--folder <name>` | Target Orchestrator folder. |
| `--cwd <path>` | Working directory for `uip` (default: process cwd). |
| `--dry-run` | Print the `uip` calls that *would* run; do not execute. |
| `--verbose` | Print full `uip` stdout/stderr. |
