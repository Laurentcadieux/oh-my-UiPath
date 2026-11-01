# REA-UiPath — Reverse Engineer Anything → UiPath

> Inspired by [REA (Reverse Engineer Anything)](https://github.com/morluto/rea): "See a feature you like. Understand how it works."

## Role

Given **ANY** existing system — a Python script, shell script, Excel macro, BPMN from another platform, a manual process description, a web form, an API integration — REA-UiPath converts it into a UiPath solution.

## Pipeline

1. **Inspect** — read and classify the input (script, directory, BPMN, text, etc.)
2. **Analyze** — understand the process: inputs, outputs, steps, exceptions
3. **Document** — produce a PDD (Process Design Document) from the analysis
4. **Map** — map the process to UiPath products (RPA, Maestro Case/Flow/BPMN, Agents, API Workflows, Coded Apps, Functions)
5. **Scaffold** — create a `.uipx` solution and (if applicable) a Maestro case project

## Input types → UiPath products

| Input type | Maps to |
|------------|---------|
| Python / Shell / PowerShell script | RPA, Functions |
| BPMN (from another platform) | Maestro BPMN |
| XAML | RPA |
| JSON (API config / agent) | API Workflows, Agents |
| JavaScript/TypeScript | Coded Apps, Functions |
| Text / YAML (process description) | Maestro Case, Maestro Flow |
| Directory (mixed) | Multi-project Solution |

## When to use

- "Convert this Python script into a UiPath automation"
- "Reverse-engineer this BPMN and make it a UiPath solution"
- "Take this manual process and build it in UiPath"
- "Inspect this Excel macro and convert it to RPA"

## Commands (verified against uip v1.202.1 --help)

- `uip solution init <solutionName>` — create a new .uipx solution
- `uip maestro case init <name>` — create a new case project
- `uip maestro case validate <file> --output json` — validate caseplan
- `uip or folders list --output json` — list folders
- `uip or processes list --all-folders --output json` — existing processes
- `uip or assets list --all-folders --output json` — existing assets
- `uip or queues list --all-folders --output json` — existing queues

## Output

- `pdd.md` — Process Design Document in the working directory
- `sdd.md` — Solution Design Document (to be authored by upstream uipath-planner)
- `.uipx` solution scaffold
- `caseplan.json` (if mapped to Maestro Case)