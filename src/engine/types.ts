/**
 * Engine types for the parallel multi-agent execution engine.
 */

/** Mutation classification for a task. */
export type TaskMutation = 'READ_ONLY' | 'AUTHORING' | 'MUTATING';

/** Status of a task during/after execution. */
export type TaskStatus = 'pending' | 'running' | 'ok' | 'failed' | 'cancelled';

/** A single node in the task dependency graph. */
export interface TaskNode {
  readonly id: string;
  readonly name: string;
  readonly agent: string;
  readonly skill: string;
  readonly uipCommands: readonly string[];
  readonly mutation: TaskMutation;
  readonly folder?: string;
  readonly tenant?: string;
  readonly deps: readonly string[];
}

/** Result of executing a single task. */
export interface TaskResult {
  readonly taskId: string;
  readonly agent: string;
  readonly status: TaskStatus;
  readonly durationMs: number;
  readonly output: string;
  readonly exitCodes: readonly number[];
}

/** A lock token for the mutation lock. */
export interface LockToken {
  readonly key: string;
  readonly release: () => void;
}

/** Tenant state snapshot — fetched once in parallel, cached with TTL. */
export interface TenantSnapshot {
  readonly folders: unknown;
  readonly assets: unknown;
  readonly queues: unknown;
  readonly processes: unknown;
  readonly fetchedAt: number;
}

/** Snapshot cache entry. */
interface SnapshotCache {
  snapshot: TenantSnapshot;
  expiresAt: number;
}

/** Global snapshot cache (module-level, like a singleton). */
let _snapshotCache: SnapshotCache | undefined;

/** Get a cached snapshot if still fresh. */
export function getCachedSnapshot(_ttlMs: number): TenantSnapshot | undefined {
  if (!_snapshotCache) return undefined;
  if (Date.now() > _snapshotCache.expiresAt) {
    _snapshotCache = undefined;
    return undefined;
  }
  return _snapshotCache.snapshot;
}

/** Store a snapshot in the cache. */
export function setCachedSnapshot(snapshot: TenantSnapshot, ttlMs: number): void {
  _snapshotCache = {
    snapshot,
    expiresAt: Date.now() + ttlMs,
  };
}

/** Clear the snapshot cache (for testing). */
export function clearSnapshotCache(): void {
  _snapshotCache = undefined;
}