/**
 * Tenant snapshot — fetches folders, assets, queues, and processes in parallel
 * at pipeline start, caches with a short TTL, and gives workers the snapshot
 * instead of letting each one re-query.
 *
 * Verified commands (uip v1.202.1):
 * - `uip or folders list --output json`
 * - `uip or assets list --all-folders --output json`
 * - `uip or queues list --all-folders --output json`
 * - `uip or processes list --all-folders --output json`
 */
import type { AgentContext } from '../types';
import { runUipAsync } from './runner';
import {
  type TenantSnapshot,
  getCachedSnapshot,
  setCachedSnapshot,
  clearSnapshotCache,
} from './types';

const DEFAULT_TTL_MS = 60_000; // 60 seconds

/**
 * Fetch the tenant snapshot in parallel.
 * All four calls run concurrently via Promise.all.
 */
export async function fetchTenantSnapshot(
  ctx: AgentContext,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<TenantSnapshot> {
  // Check cache first.
  const cached = getCachedSnapshot(ttlMs);
  if (cached) return cached;

  // Fetch all four in parallel.
  const [folders, assets, queues, processes] = await Promise.all([
    runUipAsync(ctx, ['or', 'folders', 'list', '--output', 'json']),
    runUipAsync(ctx, ['or', 'assets', 'list', '--all-folders', '--output', 'json']),
    runUipAsync(ctx, ['or', 'queues', 'list', '--all-folders', '--output', 'json']),
    runUipAsync(ctx, ['or', 'processes', 'list', '--all-folders', '--output', 'json']),
  ]);

  const snapshot: TenantSnapshot = {
    folders: safeJson(folders.stdout),
    assets: safeJson(assets.stdout),
    queues: safeJson(queues.stdout),
    processes: safeJson(processes.stdout),
    fetchedAt: Date.now(),
  };

  setCachedSnapshot(snapshot, ttlMs);
  return snapshot;
}

/** Parse JSON safely, returning the raw string on parse failure. */
function safeJson(s: string): unknown {
  if (!s.trim()) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/** Reset the snapshot cache (for testing). */
export { clearSnapshotCache };