/**
 * Skill registry — re-exports the skill loader and a memoised skill list.
 */
import type { Skill } from '../types';
import {
  loadSkills,
  getSkill as _getSkill,
  searchSkills as _searchSkills,
} from './skill-loader';

export { loadSkills, CANONICAL_SKILLS } from './skill-loader';

/** Lazy-loaded, cached list of all installed UiPath skills. */
let _cache: Skill[] | undefined;

/** Return all installed skills (loaded once, then cached). */
export function listSkills(): Skill[] {
  if (!_cache) _cache = loadSkills();
  return _cache;
}

/** Find a skill by exact name (uses the cache). */
export function getSkill(name: string): Skill | undefined {
  return _getSkill(name, listSkills());
}

/** Filter skills by free-text search (uses the cache). */
export function searchSkills(needle: string): Skill[] {
  return _searchSkills(needle, listSkills());
}

/** Number of installed skills. */
export function skillCount(): number {
  return listSkills().length;
}
