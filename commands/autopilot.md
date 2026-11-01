---
description: Run the full pipeline (plan -> review -> deploy -> test) via the omu orchestrator.
argument-hint: [--solution <path>] [--folder <name>] [--dry-run]
---

# /autopilot

Run the complete pipeline using `oh-my-UiPath` (`omu`). The orchestrator
coordinates the full sequence:

`plan -> review -> deploy -> test`

## What it does

1. **orchestrator** — resolves tenant/folder context and plans the pipeline.
2. **reviewer** — validates the existing `.uipx`/solution and gates on
   Critical findings (parses each `uip` command's JSON output).
3. **deployment-manager** — publishes the packed `.uipx` and deploys it
   (`solution deploy run` auto-activates).
4. **quality-gate** — post-deploy verification: confirms a `Successful`
   deployment landed in the target folder.

It does NOT author the `.uipx` — that is the user's job (or upstream skills).

The pipeline is **fail-fast**: it stops on the first stage whose `uip` calls
exit non-zero (or, for the reviewer, on a Critical finding). The diagnostician
runs on failure to diagnose the root cause.

## How to use

Run the underlying `omu` workflow, then summarize each stage's result
(artifacts, exit codes, failures):

```bash
# Dry-run — print the uip calls that would run, do not execute
omu autopilot --solution ./dist/my-solution.zip --dry-run

# Real run targeting a specific folder
omu autopilot --solution ./dist/my-solution.zip --folder MyFolder --verbose
```

## Options

| Option | Effect |
| --- | --- |
| `--solution <path>` | Path to a prebuilt `.uipx` / packed `.zip` to review + deploy. |
| `--tenant <name>` | Target tenant (default `OMU_TENANT`). |
| `--folder <name>` | Target Orchestrator folder (default `OMU_FOLDER`). |
| `--dry-run` | Print the `uip` calls without executing. |
| `--verbose` | Print full `uip` stdout/stderr. |

Report the overall result: which stages passed/failed, what artifacts were
produced (`orchestration-plan.json`, `quality-report.json`), and any blocking
errors.