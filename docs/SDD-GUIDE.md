# docs/SDD-GUIDE.md — SDD to deployment guide

How `oh-my-UiPath` takes a **Solution Design Document (SDD)** to a deployed,
tested UiPath automation — the `autopilot` pipeline.

## The pipeline

```
SDD ──► orchestrator ──► case-architect ──► solution-builder ──► quality-gate ──► deployment-manager ──► quality-gate
       (plan)            (caseplan.json)    (.uipx)              (validate)        (publish+deploy)        (verify)
```

| Stage | Agent | `uip` commands | Artifact |
| --- | --- | --- | --- |
| Plan | orchestrator | `uip orchestrator folders list --json` | orchestration-plan.json |
| Case | case-architect | `uip maestro case init --from-sdd`, `validate`, `pack` | caseplan.json |
| Build | solution-builder | `uip solution init`, `restore`, `pack` | dist/*.uipx |
| Validate | quality-gate | `uip maestro case validate`, `uip rpa analyze`, `uip test run` | quality-report.json |
| Deploy | deployment-manager | `uip solution upload`, `publish`, `deploy`, `activate` | (live deployment) |
| Test | quality-gate | `uip test run --json` | quality-report.json |

**Fail-fast:** `autopilot` stops on the first agent whose `uip` calls exit non-zero.

## 1. Write the SDD

Start from `templates/sdd-template.md`. An SDD captures:

- **Summary** — what the automation does and why.
- **Inputs/outputs** — data contracts.
- **Process** — the steps, mapped to UiPath surfaces (RPA / Flow / Case / Agent / API Workflow).
- **Projects** — the concrete `.uipx` projects the solution bundles.
- **Resources** — Orchestrator assets, queues, folders, IS connections.
- **Acceptance criteria** — what "done" means (used by the quality gate).

## 2. Plan (dry-run)

```bash
omu autopilot --sdd ./sdd.md --dry-run
```

This prints every `uip` call the pipeline *would* make, with no execution.
Inspect it; adjust the SDD or the `--folder`/`--tenant` flags until the plan
looks right.

## 3. Case design

The case-architect derives a `caseplan.json` from the SDD:

```bash
omu agent case-architect --sdd ./sdd.md --verbose
```

Use `templates/case-template.json` as a starting point for hand-editing.

## 4. Build

```bash
omu build --verbose
```

solution-builder scaffolds and packs the `.uipx`; quality-gate validates.

## 5. Deploy

```bash
omu deploy --solution ./dist --folder MyFolder
```

deployment-manager uploads, publishes, deploys, and activates; quality-gate
runs a post-deploy verification pass.

## 6. Full autopilot

```bash
omu autopilot --sdd ./sdd.md --folder MyFolder --verbose
```

Runs all six stages end to end, stopping on the first failure.

## Mapping SDD sections to agents

| SDD section | Consumed by |
| --- | --- |
| Summary, Inputs/outputs | orchestrator (planning), case-architect |
| Process (Case surface) | case-architect |
| Projects (.uipx) | solution-builder |
| Resources (folders/assets/queues) | deployment-manager, orchestrator |
| Acceptance criteria | quality-gate (test run / validate) |

## Tips

- Keep the SDD machine-readable: one project per bullet under **Projects**,
  one resource per row under **Resources**.
- Run `--dry-run` first, always. It catches wrong folder/tenant/paths before
  any `uip` call mutates your tenant.
- Prefer `--json` output (the agents already pass it where `uip` supports it)
  so the quality gate can parse results deterministically.
