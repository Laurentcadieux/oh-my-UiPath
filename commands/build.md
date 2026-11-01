---
description: Review an existing UiPath solution (.uipx) before deploy via omu.
argument-hint: [--solution <path>] [--dry-run]
---

# /build

Review an existing `.uipx`/solution before deploy — the **build** workflow.
With the artifact-authoring agents removed, "build" now means: validate the
already-built `.uipx` the user points at. It runs the **reviewer** only.

## What it does

1. **reviewer** — `uip rpa validate`, `uip rpa build`, and
   `uip maestro case validate`, with each command's JSON output parsed into
   Critical / Warning / Info findings. Gates on Critical.

It does not author or pack anything and does not deploy. Use this when you
want a reviewed + validated package without moving it to a tenant.

## How to use

```bash
# Dry-run — print the uip calls that would run
omu build --solution ./dist/my-solution.zip --dry-run

# Real review
omu build --solution ./dist/my-solution.zip --verbose
```

## Options

| Option | Effect |
| --- | --- |
| `--solution <path>` | Path to a prebuilt `.uipx` / packed `.zip` to review. |
| `--cwd <path>` | Working directory for `uip` (default: process cwd). |
| `--dry-run` | Print the `uip` calls without executing. |
| `--verbose` | Print full `uip` stdout/stderr. |

Report which validations passed/failed and any Critical findings or warnings.