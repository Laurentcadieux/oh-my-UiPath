/**
 * UiPath skill loader.
 *
 * Loads the installed UiPath skills from the catalog at
 * `~/.agents/skills/skills.catalog.json` and wraps them as {@link Skill}s.
 * This is the single source of truth for "which skills exist" — we never
 * hardcode the list of 27 here; we read it from the catalog the `uip` CLI
 * generated.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Skill } from '../types';
import { loadConfig } from '../config';

/** Shape of the `skills.catalog.json` entries we depend on. */
interface CatalogEntry {
  readonly name: string;
  readonly description: string;
  readonly skillPath: string;
}
interface Catalog {
  readonly skills: readonly CatalogEntry[];
}

/** Load and parse the skills catalog, returning an empty list if absent. */
export function loadSkills(): Skill[] {
  const config = loadConfig();
  const catalogPath = path.join(config.skillsRoot, 'skills.catalog.json');
  if (!fs.existsSync(catalogPath)) return [];

  const raw = fs.readFileSync(catalogPath, 'utf8');
  let parsed: Catalog;
  try {
    parsed = JSON.parse(raw) as Catalog;
  } catch {
    return [];
  }

  return parsed.skills.map((s) => ({
    name: s.name,
    description: s.description,
    path: path.join(config.skillsRoot, s.skillPath),
  }));
}

/** Find a skill by exact name. */
export function getSkill(name: string, skills?: readonly Skill[]): Skill | undefined {
  const list = skills ?? loadSkills();
  return list.find((s) => s.name === name);
}

/** Filter skills whose description mentions `needle` (case-insensitive). */
export function searchSkills(needle: string, skills?: readonly Skill[]): Skill[] {
  const list = skills ?? loadSkills();
  const lower = needle.toLowerCase();
  return list.filter(
    (s) =>
      s.name.toLowerCase().includes(lower) ||
      s.description.toLowerCase().includes(lower),
  );
}

/** The canonical 27 skill names this system is built around. */
export const CANONICAL_SKILLS: readonly string[] = [
  'uipath-admin',
  'uipath-agents',
  'uipath-aops',
  'uipath-api-workflow',
  'uipath-automation-discovery',
  'uipath-automationhub',
  'uipath-coded-apps',
  'uipath-connector-builder',
  'uipath-feedback',
  'uipath-functions',
  'uipath-governance',
  'uipath-human-in-the-loop',
  'uipath-insights',
  'uipath-ixp',
  'uipath-maestro-bpmn',
  'uipath-maestro-case',
  'uipath-maestro-flow',
  'uipath-mcp-servers',
  'uipath-planner',
  'uipath-platform',
  'uipath-process-mining',
  'uipath-review',
  'uipath-rpa',
  'uipath-skill-catalog',
  'uipath-solution',
  'uipath-tasks',
  'uipath-test',
];
