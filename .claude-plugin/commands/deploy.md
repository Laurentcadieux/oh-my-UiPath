---
description: Upload, publish, deploy, and activate a UiPath solution via omu, then verify.
argument-hint: [--solution <path>] [--folder <name>] [--dry-run]
---

# /deploy

Upload, publish, deploy, and activate a UiPath solution into a target
tenant/folder, then run a verification pass — the **deploy** workflow. Chains
`deployment-manager` then `quality-gate`.

## What it does

1. **deployment-manager** — `uip solution upload` -> `publish` -> `deploy run`
   -> `activate`.
2. **quality-gate** — post-deploy validation + tests.

Use this after `/build` (or after the build stages of `/autopilot`) when the
`.uipx` is ready and you want it live in a folder.

## How to use

```bash
# Dry-run — print the uip calls that would run
omu deploy --solution ./dist --folder MyFolder --dry-run

# Real deploy
omu deploy --solution ./dist --folder MyFolder --verbose
```

## Options

| Option | Effect |
| --- | --- |
| `--solution <path>` | Path to the `.uipx` solution / solution root to deploy. |
| `--tenant <name>` | Target tenant (default `OMU_TENANT`). |
| `--folder <name>` | Target Orchestrator folder (default `OMU_FOLDER`). |
| `--cwd <path>` | Working directory for `uip` (default: process cwd). |
| `--dry-run` | Print the `uip` calls without executing. |
| `--verbose` | Print full `uip` stdout/stderr. |

Report the deployment status: uploaded package, published version, deployment
folder/key, activation state, and post-deploy test results. Surface any
blocking errors (auth, missing folder key, failed validation) and the `uip`
commands that produced them.