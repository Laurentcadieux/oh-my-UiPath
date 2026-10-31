# Solution Design Document (SDD) — <automation name>

> Template for `oh-my-UiPath`. The `autopilot` pipeline consumes this document:
> `plan -> build -> validate -> deploy -> test`. See `docs/SDD-GUIDE.md`.
> Start here, then run `omu autopilot --sdd ./sdd.md --dry-run`.

## Summary
<!-- One paragraph: what this automation does and why. -->

## Inputs
<!-- Data contracts the automation consumes. -->
- Input A: <type> — <description>
- Input B: <type> — <description>

## Outputs
<!-- Data contracts the automation produces. -->
- Output A: <type> — <description>

## Process
<!-- The steps, mapped to the UiPath surface that owns each. -->

1. **Step 1** — <description> — *surface: RPA / Flow / Case / Agent / API Workflow*
2. **Step 2** — <description> — *surface: ...*
3. **Step 3** — <description> — *surface: ...*

## Projects
<!-- The concrete projects bundled into the .uipx. One project per bullet. -->

- `project-1` (RPA) — <description>
- `project-2` (Case) — <description>

## Resources
<!-- Orchestrator assets, queues, folders, IS connections the solution depends on. -->

| Resource | Type | Scope | Notes |
| --- | --- | --- | --- |
| <name> | Asset / Queue / Folder / Connection | <folder> | <notes> |

## Acceptance criteria
<!-- What "done" means. The quality gate uses these to drive `uip test run`. -->

- [ ] Criterion 1
- [ ] Criterion 2

## Target
- Tenant: <tenant>
- Folder: <folder>
- Notes: <deploy/activate notes>
