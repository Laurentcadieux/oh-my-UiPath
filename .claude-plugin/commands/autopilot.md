---
description: Run the full SDD-to-deploy pipeline (plan -> case -> build -> validate -> deploy -> test) via the omu orchestrator.
argument-hint: [--sdd <path>] [--folder <name>] [--dry-run]
---

# /autopilot

Run the complete **SDD-to-deploy** pipeline using `oh-my-UiPath` (`omu`).
The orchestrator coordinates the full sequence:

`plan -> case -> build -> validate -> deploy -> test`

## What it does

1. **orchestrator** — resolves tenant/folder context and plans the pipeline.
2. **case-architect** — designs + validates `caseplan.json` from the SDD.
3. **solution-builder** — inits, restores, and packs the `.uipx`.
4. **quality-gate** — validates the case plan, runs RPA analysis + tests.
5. **deployment-manager** — uploads, publishes, deploys, and activates.
6. **quality-gate** — post-deploy verification + tests.

The pipeline is **fail-fast**: it stops on the first stage whose `uip` calls
exit non-zero.

## How to use

Run the underlying `omu` workflow, then summarize each stage's result
(artifacts, exit codes, failures):

```bash
# Dry-run — print the uip calls that would run, do not execute
omu autopilot --sdd ./sdd.md --dry-run

# Real run targeting a specific folder
omu autopilot --sdd ./sdd.md --folder MyFolder --verbose
```

## Options

| Option | Effect |
| --- | --- |
| `--sdd <path>` | Path to the Solution Design Document. |
| `--solution <path>` | Path to a prebuilt `.uipx` / solution root. |
| `--tenant <name>` | Target tenant (default `OMU_TENANT`). |
| `--folder <name>` | Target Orchestrator folder (default `OMU_FOLDER`). |
| `--dry-run` | Print the `uip` calls without executing. |
| `--verbose` | Print full `uip` stdout/stderr. |

Report the overall result: which stages passed/failed, what artifacts were
produced (`caseplan.json`, `dist/*.uipx`, `orchestration-plan.json`,
`quality-report.json`), and any blocking errors.