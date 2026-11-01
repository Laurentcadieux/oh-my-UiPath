/**
 * Skill status loader — reads upstream assets/skill-status.json and
 * version-manifest.json from the installed skills root.
 *
 * Verified against @uipath/skills v1.204.1 (Nov 1 2026):
 * - assets/skill-status.json: { skills: { [name]: { status: 'stable'|'preview'|'in-development' } } }
 * - version-manifest.json: { schemaVersion: 2, skillsVersion: '1.204.1', targetCli: '^1.204.0' }
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SkillStatus, SkillStatusMap } from './types';
import { loadConfig } from './config';

/** Shape of the upstream skill-status.json. */
interface SkillStatusFile {
  readonly statuses: Record<string, { readonly label: string; readonly meaning: string }>;
  readonly skills: Record<string, { readonly status: string }>;
}

/** Shape of the upstream version-manifest.json. */
interface VersionManifest {
  readonly schemaVersion: number;
  readonly skillsVersion: string;
  readonly targetCli: string;
}

/** Load the skill status map from assets/skill-status.json. */
export function loadSkillStatusMap(): SkillStatusMap {
  const config = loadConfig();
  const statusPath = path.join(config.skillsRoot, 'assets', 'skill-status.json');
  if (!fs.existsSync(statusPath)) return {};

  try {
    const raw = fs.readFileSync(statusPath, 'utf8');
    const parsed = JSON.parse(raw) as SkillStatusFile;
    const map: SkillStatusMap = {};
    for (const [name, entry] of Object.entries(parsed.skills)) {
      const s = entry.status;
      if (s === 'stable' || s === 'preview' || s === 'in-development') {
        map[name] = s;
      } else {
        map[name] = 'unknown';
      }
    }
    return map;
  } catch {
    return {};
  }
}

/** Get the status of a single skill. */
export function getSkillStatus(name: string, map?: SkillStatusMap): SkillStatus {
  const m = map ?? loadSkillStatusMap();
  return m[name] ?? 'unknown';
}

/** Load the version manifest from version-manifest.json. */
export function loadVersionManifest(): VersionManifest | undefined {
  const config = loadConfig();
  const manifestPath = path.join(config.skillsRoot, 'version-manifest.json');
  if (!fs.existsSync(manifestPath)) return undefined;

  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    return JSON.parse(raw) as VersionManifest;
  } catch {
    return undefined;
  }
}

/** Check whether a skill is allowed for the given environment. */
export function isSkillAllowed(
  name: string,
  tenant: string | undefined,
  allowPreview: boolean | undefined,
  map?: SkillStatusMap,
): { allowed: boolean; reason?: string } {
  const status = getSkillStatus(name, map);
  if (status === 'stable') return { allowed: true };
  if (status === 'unknown') return { allowed: true }; // unknown = not in upstream catalog, allow

  const isProd = tenant?.toLowerCase() === 'prod';
  if (isProd && !allowPreview) {
    return {
      allowed: false,
      reason: `Skill "${name}" is ${status} — not allowed against prod without --allow-preview`,
    };
  }
  return { allowed: true, reason: status === 'preview' ? `Warning: skill "${name}" is Preview` : `Warning: skill "${name}" is In-development` };
}

/** Compare installed skills against upstream status map — report changes. */
export interface SyncReport {
  readonly upstreamVersion: string | undefined;
  readonly totalSkills: number;
  readonly stable: number;
  readonly preview: number;
  readonly inDevelopment: number;
  readonly unknown: number;
}

/** Build a sync report from the current state. */
export function buildSyncReport(installedCount: number, map: SkillStatusMap): SyncReport {
  const entries = Object.values(map);
  return {
    upstreamVersion: loadVersionManifest()?.skillsVersion,
    totalSkills: installedCount,
    stable: entries.filter((s) => s === 'stable').length,
    preview: entries.filter((s) => s === 'preview').length,
    inDevelopment: entries.filter((s) => s === 'in-development').length,
    unknown: entries.filter((s) => s === 'unknown').length,
  };
}