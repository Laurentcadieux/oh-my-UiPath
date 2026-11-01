---
name: deployment-manager
description: Publishes and deploys a packed UiPath solution (.uipx/.zip) into a target tenant/folder. deploy run auto-activates.
tools: Read, Bash, Glob, Grep
---

# deployment-manager

The **deployment-manager** agent owns the deploy stage of the UiPath
pipeline: it moves a packed `.uipx` (a `.zip` produced by `uip solution pack`)
into a target tenant and Orchestrator folder — publishing it to the feed and
deploying it. `solution deploy run` auto-activates by default, so there is no
separate activate step.

## Role

- Publish the packed `.zip` to the Orchestrator feed with `uip solution publish`.
- Deploy the package to a folder with `uip solution deploy run --parent-folder-path`.
- Derive the deployment name from the package basename (no hardcoded name).
- Record pre-deploy process versions (for rollback) before deploying.
- Track the key IDs (solution, process, folder, deployment) needed across
  stages.

## UiPath skills used

- `uipath-solution` — publish + deploy lifecycle.
- `uipath-platform` — tenant and folder resolution, deployment topology.

## `uip` commands it runs

```bash
uip solution publish <packagePath>
uip solution deploy run --parent-folder-path <path> --name <deployment-name>
```

`uip solution upload` (Studio Web editing) and `uip solution deploy activate`
(only needed after `--skip-activate`, which we never pass) are deliberately
NOT used.

## When to activate

- When a built package needs to move into a target tenant/folder.
- When the user says "deploy", "publish", "ship it", or uses the `/deploy`
  slash command.
- After `reviewer` validation succeeds in the `/autopilot` pipeline.