# uip Commands Used by omu-h

> Audit of every `uip` command and flag used in `src/agents/*.ts`, verified
> against `uip <command> --help` on **uip v1.202.1** (Nov 1 2026).

## Verified commands

| Command | Agent | Verified | Source |
|---------|-------|----------|--------|
| `uip or folders list --output json` | orchestrator | ✅ Yes | `uip or --help` |
| `uip solution init <solutionName>` | solution-builder | ✅ Yes | `uip solution init --help` |
| `uip solution restore <solutionPath>` | solution-builder | ✅ Yes | `uip solution restore --help` |
| `uip solution pack <solutionPath> <output-path>` | solution-builder | ✅ Yes | `uip solution pack --help` |
| `uip maestro case init <name>` | case-architect | ✅ Yes | `uip maestro case init --help` |
| `uip maestro case validate <file>` | case-architect, quality-gate | ✅ Yes | `uip maestro case validate --help` |
| `uip maestro case pack <project-path> <output-path>` | case-architect | ✅ Yes | `uip maestro case pack --help` |
| `uip solution upload <solutionPath>` | deployment-manager | ✅ Yes | `uip solution upload --help` |
| `uip solution publish <packagePath>` | deployment-manager | ✅ Yes | `uip solution publish --help` |
| `uip solution deploy run --parent-folder-path <path>` | deployment-manager | ✅ Yes | `uip solution deploy run --help` |
| `uip solution deploy activate <deployment-name>` | deployment-manager | ✅ Yes | `uip solution deploy activate --help` |

## Unverified / removed commands

| Command | Was in | Status | Reason |
|---------|--------|--------|--------|
| `uip rpa analyze --json` | quality-gate | ❌ Removed | `uip rpa` requires `@uipath/rpa-tool` which is not installed (EACCES). `--json` is not a valid flag — the correct flag is `--output json`. Reinstated only after the rpa-tool is installed. |
| `uip test run --json` | quality-gate | ❌ Removed | `uip test` does not exist as a top-level command. Test execution uses `uip or` subcommands (e.g. `uip or jobs run`). |

## Previously broken (fixed in v1.3.0)

| Was | Fixed to | Why |
|-----|---------|-----|
| `solution upload --path <target>` | `solution upload <solutionPath>` | `--path` is not a flag; upload takes a positional arg |
| `solution publish --folder <f>` | `solution publish <packagePath>` | `--folder` is not a flag; publish takes a positional package path |
| `solution deploy --folder <f>` | `solution deploy run --parent-folder-path <path>` | Deploy is a subcommand group; `run` is the deploy action |
| `solution activate` | `solution deploy activate <deployment-name>` | Activate is under `deploy activate` and takes a positional name |
| `maestro case init --from-sdd <sdd>` | `maestro case init <name>` | `--from-sdd` does not exist; init takes a positional name |
| `maestro case validate` | `maestro case validate <file>` | Validate requires a positional `<file>` arg |
| `maestro case pack` | `maestro case pack <project-path> <output-path>` | Pack requires two positional args |
| `solution init --name <n>` | `solution init <solutionName>` | `--name` is not a flag; init takes a positional name |
| `solution restore` | `solution restore <solutionPath>` | Restore requires a positional `<solutionPath>` |
| `solution pack --output <dir>` | `solution pack <solutionPath> <output-path>` | Pack takes two positionals, not `--output` |
| `orchestrator folders list --json` | `or folders list --output json` | `--json` is not a flag; correct is `--output json` |

## How verification was done

Each command was verified by running `uip <command> --help` on the real
`uip` binary at `/home/uipath-coder/.npm-global/bin/uip` (v1.202.1) on
Nov 1 2026. The help output was inspected for:
1. The command exists as a subcommand
2. The flags used are valid options
3. Positional arguments match the expected shape