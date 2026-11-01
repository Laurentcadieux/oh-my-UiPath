/**
 * Mutation lock — async mutex per tenant+folder.
 *
 * MUTATING tasks acquire a lock for `${tenant}/${folder}` before running.
 * Only one MUTATING task runs against the same folder at a time.
 * READ_ONLY and AUTHORING tasks never acquire the lock.
 */
import type { LockToken } from './types';

/** Internal lock state. */
interface LockState {
  held: boolean;
  queue: Array<() => void>;
}

/** Map of key → lock state. */
const _locks = new Map<string, LockState>();

/** Get or create the lock state for a key. */
function getLockState(key: string): LockState {
  let state = _locks.get(key);
  if (!state) {
    state = { held: false, queue: [] };
    _locks.set(key, state);
  }
  return state;
}

/** Build a lock key from tenant + folder. */
export function lockKey(tenant?: string, folder?: string): string {
  return `${tenant ?? 'default'}/${folder ?? 'global'}`;
}

/**
 * Acquire the lock for `key`. Returns a Promise that resolves when the
 * lock is held, and a token with a `release()` method.
 */
export function acquireLock(key: string): Promise<LockToken> {
  const state = getLockState(key);

  return new Promise<LockToken>((resolve) => {
    if (!state.held) {
      // Lock is free — take it immediately.
      state.held = true;
      resolve({
        key,
        release: () => {
          state.held = false;
          // Wake the next waiter in the queue.
          const next = state.queue.shift();
          if (next) {
            state.held = true;
            next();
          }
        },
      });
    } else {
      // Lock is held — queue ourselves.
      state.queue.push(() => {
        state.held = true;
        resolve({
          key,
          release: () => {
            state.held = false;
            const next = state.queue.shift();
            if (next) {
              state.held = true;
              next();
            }
          },
        });
      });
    }
  });
}

/** Release all locks and clear state (for testing). */
export function resetLocks(): void {
  _locks.clear();
}