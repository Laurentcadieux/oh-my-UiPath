/**
 * Shared safety utilities for oh-my-UiPath.
 *
 * Used by both `runUip()` (src/config.ts) and the PreToolUse hook
 * (hooks/safety-guard.mjs) so they apply the same prod-tenant rules.
 *
 * The `loco` escape hatch: if the active tenant is literally "loco",
 * all guard rails are disabled — every command is allowed, no
 * MUTATING/READ_ONLY classification, no skill maturity gating.
 * This is for local development where the user is the only operator.
 */

/** Default prod tenant pattern — matches if the tenant name *contains* prod, prd, or production. */
export const DEFAULT_PROD_PATTERN = '(prod|prd|production)';

/** Local-dev tenant name — disables all guard rails. */
export const LOCAL_TENANT = 'loco';

/** Load .omu.json from project root or home directory. */
export function loadOmuJson(): Record<string, unknown> {
  try {
    const { readFileSync, existsSync } = require('node:fs');
    const { join } = require('node:path');
    const { homedir } = require('node:os');
    const candidates = [
      join(process.cwd(), '.omu.json'),
      join(homedir(), '.omu.json'),
    ];
    for (const p of candidates) {
      if (existsSync(p)) {
        return JSON.parse(readFileSync(p, 'utf8'));
      }
    }
  } catch {
    // ignore
  }
  return {};
}

/** Resolve the prod tenant pattern: env → .omu.json → default. */
export function loadProdPattern(): string {
  const fromEnv = process.env.OMU_PROD_TENANT_PATTERN;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  const cfg = loadOmuJson();
  const fromConfig = (cfg as Record<string, unknown>).prodTenantPattern;
  if (typeof fromConfig === 'string' && fromConfig.length > 0) return fromConfig;
  return DEFAULT_PROD_PATTERN;
}

/** True if the tenant name is the local-dev escape hatch ("loco"). */
export function isLocalTenant(tenant: string | undefined | null): boolean {
  return typeof tenant === 'string' && tenant.toLowerCase() === LOCAL_TENANT;
}

/** True if the tenant name matches the configured prod pattern. */
export function isProdTenant(
  tenant: string | undefined | null,
  pattern?: string,
): boolean {
  if (!tenant || tenant.length === 0) return false;
  try {
    const re = new RegExp(pattern ?? loadProdPattern(), 'i');
    return re.test(tenant);
  } catch {
    // Bad regex — fail closed (treat as prod)
    return true;
  }
}

/** True if guard rails should apply (tenant is not loco). */
export function shouldGuard(tenant: string | undefined | null): boolean {
  return !isLocalTenant(tenant);
}