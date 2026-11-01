# REA-UiPath — Reverse Engineer Anything → UiPath

> Inspired by [REA (Reverse Engineer Anything)](https://github.com/morluto/rea): "See a feature you like. Understand how it works."

## Role

Given **ANY** existing system — a Python script, shell script, Excel macro, BPMN from another platform, a manual process description, a web form, an API integration — REA-UiPath converts it into a UiPath solution **with a Coded App as the end-user presentation layer**.

## Pipeline

1. **Inspect** — read and classify the input (script, directory, BPMN, text, etc.)
2. **Analyze** — understand the process: inputs, outputs, steps, exceptions
3. **Document** — produce a PDD (Process Design Document) from the analysis
4. **Map** — map the process to UiPath products (RPA, Maestro Case/Flow/BPMN, Agents, API Workflows, Functions)
5. **Scaffold automation** — create a `.uipx` solution + (if applicable) Maestro case project
6. **Scaffold Coded App** — create a React/TypeScript Vite app as the end-user presentation layer, configured for UiPath Cloud (`base: './'`, `@uipath/uipath-typescript` SDK)

## Input types → UiPath products

Every conversion produces a **Coded App** (end-user frontend) + the automation product(s):

| Input type | Automation product(s) | + Coded App |
|------------|----------------------|-------------|
| Python / Shell / PowerShell | RPA, Functions | ✅ |
| BPMN (from another platform) | Maestro BPMN | ✅ |
| XAML | RPA | ✅ |
| JSON (API config / agent) | API Workflows, Agents | ✅ |
| JavaScript/TypeScript | Functions | ✅ |
| Text / YAML (process description) | Maestro Case, Maestro Flow | ✅ |
| Directory (mixed) | Multi-project Solution | ✅ |

## Coded App scaffolding

Per the upstream `uipath-coded-apps` skill:
- Standalone coded apps scaffold with `npx create-vite` (NOT `uip codedapp init`, which is for in-solution apps)
- `vite.config.ts` must set `base: './'` (platform handles URL routing)
- Uses `@uipath/uipath-typescript` SDK for UiPath Cloud API calls
- Deploy via: `uip codedapp pack` → `uip codedapp publish` → `uip codedapp deploy`

## When to use

- "Convert this Python script into a UiPath automation with a frontend"
- "Reverse-engineer this BPMN and build a UiPath solution with a Coded App"
- "Take this manual process and build it in UiPath with a user interface"
- "Inspect this Excel macro and convert it to RPA + Coded App"

## Commands (verified against uip v1.202.1 --help)

- `uip solution init <solutionName>` — create a new .uipx solution
- `uip maestro case init <name>` — create a new case project
- `uip maestro case validate <file> --output json` — validate caseplan
- `uip or folders list --output json` — list folders
- `uip or processes list --all-folders --output json` — existing processes
- `uip or assets list --all-folders --output json` — existing assets
- `uip or queues list --all-folders --output json` — existing queues
- `npx create-vite <name> --template react-ts` — scaffold the Coded App

## Output

- `pdd.md` — Process Design Document
- `.uipx` solution scaffold
- `caseplan.json` (if mapped to Maestro Case)
- `{solutionName}-app/` — Coded App (React/TypeScript Vite) with:
  - `vite.config.ts` (base: './')
  - `src/uipath.ts` (UiPath SDK init)