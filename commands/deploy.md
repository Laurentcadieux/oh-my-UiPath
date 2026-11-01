---
description: Publish + deploy a UiPath solution via omu, then verify the deployment.
argument-hint: [--solution <path>] [--folder <name>] [--dry-run]
---

# /deploy

Publish and deploy a packed UiPath solution (`.uipx`/`.zip`) into a target
tenant/folder, then verify the deployment — the **deploy** workflow. Chains
`deployment-manager` then `quality-gate`.

## What it does

1. **deployment-manager** — `uip solution publish` -> `uip solution deploy run`
   (auto-activates; no separate activate step).
2. **quality-gate** — `uip solution deploy list --folder-path <folder>` and
   confirms at least one deployment is `Successful`.

Use this after `/build` (or the review stage of `/autopilot`) when the
`.uipx` is reviewed and you want it live in a folder.

## How to use

```bash
# Dry-run — print the uip calls that would run
omu deploy --solution ./dist/my-solution.zip --folder MyFolder --dry-run

# Real deploy
omu deploy --solution ./dist/my-solution.zip --folder MyFolder --verbose
```

## Options

| Option | Effect |
| --- | --- |
| `--solution <path>` | Path to the packed `.uipx`/`.zip` to publish + deploy. |
| `--tenant <name>` | Target tenant (default `OMU_TENANT`). |
| `--folder <name>` | Target Orchestrator folder (default `OMU_FOLDER`). |
| `--cwd <path>` | Working directory for `uip` (default: process cwd). |
| `--dry-run` | Print the `uip` calls without executing. |
| `--verbose` | Print full `uip` stdout/stderr. |

Report the deployment status: published version, deployment name/folder, and
the post-deploy verification result. Surface any blocking errors (auth,
missing folder, no `Successful` deployment) and the `uip` commands that
produced them.