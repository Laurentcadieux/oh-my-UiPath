import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Import the safety utilities from the built dist
import {
  isLocalTenant,
  isProdTenant,
  shouldGuard,
  loadProdPattern,
  LOCAL_TENANT,
  DEFAULT_PROD_PATTERN,
} from '../src/safety';

describe('safety.ts', () => {
  describe('isLocalTenant', () => {
    it('returns true for "loco"', () => {
      assert.equal(isLocalTenant('loco'), true);
    });
    it('returns true for "LOCO" (case-insensitive)', () => {
      assert.equal(isLocalTenant('LOCO'), true);
    });
    it('returns true for "Loco"', () => {
      assert.equal(isLocalTenant('Loco'), true);
    });
    it('returns false for "Prod"', () => {
      assert.equal(isLocalTenant('Prod'), false);
    });
    it('returns false for undefined', () => {
      assert.equal(isLocalTenant(undefined), false);
    });
    it('returns false for empty string', () => {
      assert.equal(isLocalTenant(''), false);
    });
  });

  describe('isProdTenant', () => {
    it('returns true for "Prod"', () => {
      assert.equal(isProdTenant('Prod'), true);
    });
    it('returns true for "Production"', () => {
      assert.equal(isProdTenant('Production'), true);
    });
    it('returns true for "prod-eu"', () => {
      assert.equal(isProdTenant('prod-eu'), true);
    });
    it('returns true for "prod_eu"', () => {
      assert.equal(isProdTenant('prod_eu'), true);
    });
    it('returns true for "prd"', () => {
      assert.equal(isProdTenant('prd'), true);
    });
    it('returns true for "acme-prod"', () => {
      assert.equal(isProdTenant('acme-prod'), true);
    });
    it('returns true for "eu-production"', () => {
      assert.equal(isProdTenant('eu-production'), true);
    });
    it('returns true for "prod.eu"', () => {
      assert.equal(isProdTenant('prod.eu'), true);
    });
    it('returns true for "ProdTenant"', () => {
      assert.equal(isProdTenant('ProdTenant'), true);
    });
    it('returns true for "prod1"', () => {
      assert.equal(isProdTenant('prod1'), true);
    });
    it('returns false for "Test"', () => {
      assert.equal(isProdTenant('Test'), false);
    });
    it('returns false for "Dev"', () => {
      assert.equal(isProdTenant('Dev'), false);
    });
    it('returns false for "loco"', () => {
      assert.equal(isProdTenant('loco'), false);
    });
    it('returns false for empty string', () => {
      assert.equal(isProdTenant(''), false);
    });
    it('returns false for undefined', () => {
      assert.equal(isProdTenant(undefined), false);
    });
    it('returns false for null', () => {
      assert.equal(isProdTenant(null), false);
    });
    it('with custom pattern: returns true for "my-prod"', () => {
      assert.equal(isProdTenant('my-prod', '^my-prod$'), true);
    });
    it('with custom pattern: returns false for "my-test"', () => {
      assert.equal(isProdTenant('my-test', '^my-prod$'), false);
    });
    it('with bad regex: fails closed (treats as prod)', () => {
      assert.equal(isProdTenant('anything', '['), true);
    });
  });

  describe('shouldGuard', () => {
    it('returns false for "loco"', () => {
      assert.equal(shouldGuard('loco'), false);
    });
    it('returns false for "LOCO"', () => {
      assert.equal(shouldGuard('LOCO'), false);
    });
    it('returns true for "Prod"', () => {
      assert.equal(shouldGuard('Prod'), true);
    });
    it('returns true for "Test"', () => {
      assert.equal(shouldGuard('Test'), true);
    });
    it('returns true for undefined', () => {
      assert.equal(shouldGuard(undefined), true);
    });
  });

  describe('loadProdPattern', () => {
    let origEnv: string | undefined;
    let omuPath: string;

    beforeEach(() => {
      origEnv = process.env.OMU_PROD_TENANT_PATTERN;
      delete process.env.OMU_PROD_TENANT_PATTERN;
      omuPath = path.join(process.cwd(), '.omu.json');
    });

    afterEach(() => {
      if (origEnv !== undefined) {
        process.env.OMU_PROD_TENANT_PATTERN = origEnv;
      } else {
        delete process.env.OMU_PROD_TENANT_PATTERN;
      }
      try { fs.unlinkSync(omuPath); } catch { /* ignore */ }
    });

    it('returns default pattern when no config or env', () => {
      try { fs.unlinkSync(omuPath); } catch { /* ignore */ }
      assert.equal(loadProdPattern(), DEFAULT_PROD_PATTERN);
    });

    it('returns env value when set', () => {
      process.env.OMU_PROD_TENANT_PATTERN = '^my-prod$';
      assert.equal(loadProdPattern(), '^my-prod$');
    });

    it('returns .omu.json value when set', () => {
      fs.writeFileSync(omuPath, JSON.stringify({ prodTenantPattern: '^test-prod$' }));
      assert.equal(loadProdPattern(), '^test-prod$');
    });

    it('env takes priority over .omu.json', () => {
      fs.writeFileSync(omuPath, JSON.stringify({ prodTenantPattern: '^json-prod$' }));
      process.env.OMU_PROD_TENANT_PATTERN = '^env-prod$';
      assert.equal(loadProdPattern(), '^env-prod$');
    });

    it('returns "loco" when .omu.json has it', () => {
      fs.writeFileSync(omuPath, JSON.stringify({ prodTenantPattern: 'loco' }));
      assert.equal(loadProdPattern(), 'loco');
    });
  });

  describe('LOCAL_TENANT', () => {
    it('is "loco"', () => {
      assert.equal(LOCAL_TENANT, 'loco');
    });
  });

  describe('DEFAULT_PROD_PATTERN', () => {
    it('matches prod, prd, production', () => {
      const re = new RegExp(DEFAULT_PROD_PATTERN, 'i');
      assert.ok(re.test('Prod'));
      assert.ok(re.test('prd'));
      assert.ok(re.test('Production'));
      assert.ok(re.test('prod-eu'));
      assert.ok(re.test('eu-production'));
      assert.ok(!re.test('Test'));
      assert.ok(!re.test('Dev'));
    });
  });
});