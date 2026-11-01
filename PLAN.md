# PLAN.md — Phase 3: Speed (multi-agent)

## What exists now

- `runUip()` uses `spawnSync` — synchronous, blocking. No parallelism.
- `runUipChain()` — sequential stop-on-failure within a single agent.
- 7 agents: orchestrator, solution-builder, case-architect, reviewer, quality-gate, deployment-manager, diagnostician.
- Autopilot: plan → case → build → review → deploy → test (sequential, stop on failure).

## Phase 3 deliverables

### 3.1 — Task graph (DAG)

**New file: `src/engine/task-graph.ts`**

Convert the autopilot pipeline into a dependency graph. Each `TaskNode`:

```typescript
interface TaskNode {
  id: string;
  name: string;
  agent: string;
  skill: string;
  uipCommands: string[];
  mutation: 'READ_ONLY' | 'AUTHORING' | 'MUTATING';
  folder?: string;
  tenant?: string;
  deps: string[];  // task IDs this depends on
}
```

Classification:
- **READ_ONLY**: `list`, `status`, `get`, `search`, `validate` — no state change
- **AUTHORING**: `init`, `project add`, `restore`, `pack` — writes local files, no tenant change
- **MUTATING**: `publish`, `deploy run`, `deploy activate`, `upload` — changes tenant state

The DAG builder maps the 6-stage autopilot sequence into tasks:
- `plan` (READ_ONLY) — depends on nothing
- `case` (AUTHORING) — depends on `plan`
- `build` (AUTHORING) — depends on `case`
- `review` (READ_ONLY) — depends on `build`
- `deploy` (MUTATING) — depends on `review`
- `test` (READ_ONLY) — depends on `deploy`

Independent READ_ONLY and AUTHORING tasks can run in parallel. MUTATING tasks serialize per folder.

### 3.2 — Async process execution + worker pool

**New file: `src/engine/runner.ts`**

Replace `spawnSync` with async `spawn` + `Promise`:
```typescript
async function runUipAsync(ctx, args): Promise<UipRunResult>
```

**New file: `src/engine/worker-pool.ts`**

- Configurable concurrency (default 4, `--concurrency N` flag).
- A `Semaphore` class limits concurrent async tasks.
- `runParallel(tasks, concurrency)` — runs tasks in parallel batches, respecting the semaphore.
- Failed task → cancel its dependents, keep unrelated branches running.

### 3.3 — Mutation lock

**New file: `src/engine/mutation-lock.ts`**

- Key: `${tenant}/${folder}` (or `global` if no folder).
- `async acquire(key): Promise<LockToken>` — blocks until free, returns a token.
- `release(token)` — releases the lock.
- Async mutex using a `Map<string, Promise>` queue per key.
- MUTATING tasks acquire the lock before running; READ_ONLY/AUTHORING never acquire.

### 3.4 — Tenant snapshot

**New file: `src/engine/tenant-snapshot.ts`**

At pipeline start, fetch in parallel (using async runner):
- `uip or folders list --output json`
- `uip or assets list --all-folders --output json`
- `uip or queues list --all-folders --output json`
- `uip or processes list --all-folders --output json`

Cache with 60s TTL. Workers read from snapshot instead of re-querying. Pass snapshot through `AgentContext` (new field `tenantSnapshot?: TenantSnapshot`).

### 3.5 — Parallel engine entry

**New file: `src/engine/index.ts`**

`runPipeline(ctx, mode: 'sequential' | 'parallel')`:
- Build the DAG from the autopilot stages.
- Sequential mode: run stages in order (current behaviour).
- Parallel mode: run independent READ_ONLY/AUTHORING tasks in parallel; MUTATING tasks through the lock; fail-fast cancels dependents.
- Return `AgentResult[]` with per-task status table.

### 3.6 — bench command

**New CLI command: `omu-h bench --sdd <file>`**

- Runs the same SDD through both sequential and parallel modes.
- Prints wall-clock time per stage per mode + speedup ratio.
- `--dry-run`: prints the DAG, parallel batches, and which tasks take the lock — no `uip` calls.

### 3.7 — Integrate into autopilot

Add `--parallel` flag to `autopilot` (default: sequential for safety). When `--parallel`:
- Use the engine's `runPipeline(ctx, 'parallel')` instead of the sequential agent loop.

## Files to create

| File | Purpose |
|------|---------|
| `src/engine/types.ts` | `TaskNode`, `TaskStatus`, `LockToken`, `TenantSnapshot`, `EngineResult` |
| `src/engine/task-graph.ts` | DAG builder: autopilot stages → `TaskNode[]` + edges |
| `src/engine/runner.ts` | Async `runUipAsync()` replacing spawnSync |
| `src/engine/worker-pool.ts` | Semaphore + parallel worker pool with fail-fast |
| `src/engine/mutation-lock.ts` | Per-folder async mutex for MUTATING tasks |
| `src/engine/tenant-snapshot.ts` | Parallel tenant state fetch + 60s TTL cache |
| `src/engine/index.ts` | Engine entry — `runPipeline(ctx, mode)` |
| `test/engine.test.ts` | Unit tests for DAG, lock, cancellation, parallel execution |

## Files to modify

| File | Change |
|------|--------|
| `src/types.ts` | Add `TenantSnapshot`, `EngineMode` type |
| `src/cli.ts` | Add `bench` command; add `--parallel` and `--concurrency` flags to `autopilot` |
| `package.json` | Bump to 1.5.0 |
| `docs/UIP-COMMANDS.md` | Add tenant snapshot commands |
| `README.md` | Document `bench` + parallel mode |

## Acceptance

- [ ] `omu-h bench --sdd <file>` runs sequential vs parallel, prints wall-clock per stage
- [ ] `--dry-run` on bench prints DAG, parallel batches, and which tasks take the lock
- [ ] `--parallel` flag on autopilot uses the engine
- [ ] MUTATING tasks serialize per folder via lock (unit tested)
- [ ] Failed task cancels dependents, unrelated branches continue (unit tested)
- [ ] Tenant snapshot fetches in parallel with TTL (unit tested)
- [ ] `npm test` passes (36 existing + new engine tests)
- [ ] `claude plugin validate .` passes
- [ ] Every `uip` command verified against `uip --help`

## Constraints

- Do NOT modify or fork upstream skills.
- Do NOT change `package.json` name.
- All `uip` calls go through the real binary — nothing simulated.
- `--dry-run` must print the DAG + batches + lock assignments.