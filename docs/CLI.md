# docs/CLI.md — `omu` command reference

`omu` is the single command surface over the agents, workflows, and skills.
Built with `commander.js`.

## Global

```
omu --help            # top-level help
omu --version         # 0.1.0
```

## Introspection

| Command | Description |
| --- | --- |
| `omu agents` | List agents, their roles, skills, and `uip` commands. |
| `omu workflows` | List workflows and their steps. |
| `omu skills` | List all installed UiPath skills. |
| `omu skills --search <needle>` | Free-text filter on skill name/description. |
| `omu skill <name>` | Show one skill by exact name. |
| `omu config` | Show resolved config (uip bin, skills root, defaults). |

## Running an agent

```
omu agent <name> [options]
```

Runs a single agent by name (e.g. `omu agent solution-builder --dry-run`).

## Running a workflow

| Command | Workflow | Steps |
| --- | --- | --- |
| `omu autopilot` | autopilot | plan -> case -> build -> validate -> deploy -> test |
| `omu build` | build | pack -> validate |
| `omu deploy` | deploy | deploy -> verify |
| `omu run <workflow>` | any | run any registered workflow by name |

## Shared run options (agent + workflow commands)

| Option | Default | Effect |
| --- | --- | --- |
| `--sdd <path>` | — | Path to the Solution Design Document. |
| `--solution <path>` | — | Path to the `.uipx` solution or solution root. |
| `--tenant <name>` | `OMU_TENANT` env | Target tenant. |
| `--folder <name>` | `OMU_FOLDER` env | Target Orchestrator folder. |
| `--cwd <path>` | process cwd | Working directory for `uip`. |
| `--dry-run` | false | Print the `uip` calls that would run; do not execute. |
| `--verbose` | false | Print full `uip` stdout/stderr. |

## Environment variables

| Variable | Purpose |
| --- | --- |
| `OMU_UIP_BIN` | Override the `uip` binary path (default `~/.npm-global/bin/uip`). |
| `OMU_SKILLS_ROOT` | Override the skills root (default `~/.agents/skills`). |
| `OMU_TENANT` | Default tenant. |
| `OMU_FOLDER` | Default Orchestrator folder. |

## Examples

```bash
# Plan only — no uip calls execute
omu autopilot --sdd ./sdd.md --dry-run

# Full pipeline against a folder
omu autopilot --sdd ./sdd.md --folder MyFolder --verbose

# Just pack + validate
omu build --verbose

# Deploy a packed solution
omu deploy --solution ./dist --folder MyFolder

# Inspect the catalog
omu skills --search case
omu skill uipath-maestro-case
```

## Exit codes

- `0` — all agent steps succeeded.
- `1` — at least one agent step failed (its `uip` calls exited non-zero), or an unknown agent/workflow was requested.
