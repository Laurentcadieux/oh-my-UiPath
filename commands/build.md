---
description: Pack and validate the UiPath solution (pack -> validate) via omu.
argument-hint: [--sdd <path>] [--solution <path>] [--dry-run]
---

# /build

Pack the UiPath solution and validate it — the **build** workflow. Chains
`solution-builder` (pack) then `quality-gate` (validate).

## What it does

1. **solution-builder** — `uip solution init` -> `restore` -> `pack` into
   `dist/*.uipx`.
2. **quality-gate** — `uip maestro case validate`, `uip rpa analyze`,
   `uip test run`.

Does not deploy. Use this when you want a built + validated package without
moving it to a tenant.

## How to use

```bash
# Dry-run — print the uip calls that would run
omu build --sdd ./sdd.md --dry-run

# Real build
omu build --sdd ./sdd.md --verbose
```

## Options

| Option | Effect |
| --- | --- |
| `--sdd <path>` | Path to the Solution Design Document. |
| `--solution <path>` | Path to a prebuilt `.uipx` / solution root. |
| `--cwd <path>` | Working directory for `uip` (default: process cwd). |
| `--dry-run` | Print the `uip` calls without executing. |
| `--verbose` | Print full `uip` stdout/stderr. |

Report which stages passed/failed, the produced `dist/*.uipx` artifacts, and
any validation errors or analysis findings.