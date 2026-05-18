import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PrivacyService,
  RetentionPolicyValidationError,
  DELETION_GRACE_DAYS,
} from './privacy.service';
import { Organization } from '../../iam/domain/organization.entity';
import { AuditEventType } from '../../audit-log/application/types';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  const org = Organization.create({
    name: 'Test Org',
    currencyCode: 'EUR',
    defaultLocale: 'es',
    timezone: 'Europe/Madrid',
  });
  // Replace the auto UUID with the deterministic ORG so the assertions are stable.
  Object.defineProperty(org, 'id', {
    value: ORG,
    writable: true,
    configurable: true,
    enumerable: true,
  });
  org.createdAt = new Date('2026-01-01T00:00:00Z');
  org.updatedAt = new Date('2026-01-01T00:00:00Z');
  Object.assign(org, overrides);
  return org;
}

/**
 * Builds a stub DataSource: only `query()` for raw SQL (export dump-table)
 * and `getRepository(Organization)` for the upsert paths. The repo is
 * itself a mock that owns a single in-memory org row indexed by id.
 */
function makeDataSource(seed: Organization | null) {
  let stored: Organization | null = seed;
  const repo = {
    findOneBy: jest.fn(async () => stored),
    save: jest.fn(async (o: Organization) => {
      stored = o;
      return o;
    }),
  };
  return {
    ds: {
      getRepository: jest.fn(() => repo),
      query: jest.fn(async () => [] as unknown[]),
    } as unknown as ConstructorParameters<typeof PrivacyService>[0],
    repo,
    getStored: () => stored,
  };
}

function makeEvents() {
  const events = new EventEmitter2();
  const emitSpy = jest.spyOn(events, 'emitAsync');
  return { events, emitSpy };
}

describe('PrivacyService', () => {
  describe('getPrivacyState', () => {
    it('returns the org GDPR slice with defaults applied', async () => {
      const { ds } = makeDataSource(makeOrg());
      const { events } = makeEvents();
      const svc = new PrivacyService(ds as never, events);
      const result = await svc.getPrivacyState(ORG);
      expect(result.organizationId).toBe(ORG);
      expect(result.retentionPolicy.audit_log_days).toBe(2555);
      expect(result.retentionPolicy.photos_days).toBe(90);
      expect(result.retentionPolicy.m3_review_queue_days).toBe(365);
      expect(result.dpoContact).toBeNull();
      expect(result.deletionScheduledAt).toBeNull();
    });

    it('404 when org missing', async () => {
      const { ds } = makeDataSource(null);
      const { events } = makeEvents();
      const svc = new PrivacyService(ds as never, events);
      await expect(svc.getPrivacyState(ORG)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('scheduleDeletion', () => {
    it('writes deletionScheduledAt ≈ now + 30d and emits PRIVACY_DELETE_SCHEDULED', async () => {
      const { ds, getStored } = makeDataSource(makeOrg());
      const { events, emitSpy } = makeEvents();
      const svc = new PrivacyService(ds as never, events);
      const before = Date.now();
      const { deletionScheduledAt } = await svc.scheduleDeletion(ORG, USER);
      const scheduled = new Date(deletionScheduledAt).getTime();
      const expectedMin = before + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000 - 1000;
      const expectedMax = Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000 + 1000;
      expect(scheduled).toBeGreaterThanOrEqual(expectedMin);
      expect(scheduled).toBeLessThanOrEqual(expectedMax);
      expect(getStored()?.deletionScheduledAt).not.toBeNull();
      const channels = emitSpy.mock.calls.map((c) => c[0]);
      expect(channels).toContain(AuditEventType.PRIVACY_DELETE_SCHEDULED);
    });
  });

  describe('cancelScheduledDeletion', () => {
    it('clears the timestamp and emits PRIVACY_DELETE_CANCELLED when scheduled', async () => {
      const seeded = makeOrg({
        deletionScheduledAt: new Date('2026-06-01T00:00:00Z'),
      } as Partial<Organization>);
      const { ds, getStored } = makeDataSource(seeded);
      const { events, emitSpy } = makeEvents();
      const svc = new PrivacyService(ds as never, events);
      const result = await svc.cancelScheduledDeletion(ORG, USER);
      expect(result.wasScheduled).toBe(true);
      expect(result.deletionScheduledAt).toBeNull();
      expect(getStored()?.deletionScheduledAt).toBeNull();
      const channels = emitSpy.mock.calls.map((c) => c[0]);
      expect(channels).toContain(AuditEventType.PRIVACY_DELETE_CANCELLED);
    });

    it('no-ops with wasScheduled=false when nothing scheduled', async () => {
      const { ds } = makeDataSource(makeOrg());
      const { events, emitSpy } = makeEvents();
      const svc = new PrivacyService(ds as never, events);
      const result = await svc.cancelScheduledDeletion(ORG, USER);
      expect(result.wasScheduled).toBe(false);
      const channels = emitSpy.mock.calls.map((c) => c[0]);
      expect(channels).not.toContain(AuditEventType.PRIVACY_DELETE_CANCELLED);
    });
  });

  describe('updateRetentionPolicy', () => {
    it('partial-updates a field and emits PRIVACY_RETENTION_POLICY_CHANGED', async () => {
      const { ds, getStored } = makeDataSource(makeOrg());
      const { events, emitSpy } = makeEvents();
      const svc = new PrivacyService(ds as never, events);
      const result = await svc.updateRetentionPolicy(ORG, { photos_days: 120 }, USER);
      expect(result.photos_days).toBe(120);
      expect(result.audit_log_days).toBe(2555); // unchanged
      expect(getStored()?.retentionPolicy.photos_days).toBe(120);
      const channels = emitSpy.mock.calls.map((c) => c[0]);
      expect(channels).toContain(AuditEventType.PRIVACY_RETENTION_POLICY_CHANGED);
    });

    it('throws RetentionPolicyValidationError on out-of-range', async () => {
      const { ds } = makeDataSource(makeOrg());
      const { events } = makeEvents();
      const svc = new PrivacyService(ds as never, events);
      await expect(
        svc.updateRetentionPolicy(ORG, { photos_days: 9999 }, USER),
      ).rejects.toBeInstanceOf(RetentionPolicyValidationError);
      await expect(
        svc.updateRetentionPolicy(ORG, { audit_log_days: 100 }, USER),
      ).rejects.toBeInstanceOf(RetentionPolicyValidationError);
      await expect(
        svc.updateRetentionPolicy(ORG, { audit_log_days: 9999 }, USER),
      ).rejects.toBeInstanceOf(RetentionPolicyValidationError);
    });

    it('rejects non-integer values', async () => {
      const { ds } = makeDataSource(makeOrg());
      const { events } = makeEvents();
      const svc = new PrivacyService(ds as never, events);
      await expect(
        svc.updateRetentionPolicy(ORG, { photos_days: 90.5 }, USER),
      ).rejects.toBeInstanceOf(RetentionPolicyValidationError);
    });
  });

  describe('updateDpoContact', () => {
    it('upserts the contact and emits PRIVACY_DPO_CONTACT_UPDATED', async () => {
      const { ds, getStored } = makeDataSource(makeOrg());
      const { events, emitSpy } = makeEvents();
      const svc = new PrivacyService(ds as never, events);
      const result = await svc.updateDpoContact(
        ORG,
        { name: 'Marina', email: 'dpo@x.es', phone: '+34 666' },
        USER,
      );
      expect(result?.email).toBe('dpo@x.es');
      expect(getStored()?.dpoContact?.email).toBe('dpo@x.es');
      const channels = emitSpy.mock.calls.map((c) => c[0]);
      expect(channels).toContain(AuditEventType.PRIVACY_DPO_CONTACT_UPDATED);
    });

    it('clears the contact when passed null', async () => {
      const seeded = makeOrg({
        dpoContact: { name: 'Old', email: 'old@x.es' },
      } as Partial<Organization>);
      const { ds, getStored } = makeDataSource(seeded);
      const { events } = makeEvents();
      const svc = new PrivacyService(ds as never, events);
      const result = await svc.updateDpoContact(ORG, null, USER);
      expect(result).toBeNull();
      expect(getStored()?.dpoContact).toBeNull();
    });
  });

  describe('exportOrganization', () => {
    it('builds a ZIP with manifest + all required JSONL files + emits audit envelope', async () => {
      const { ds } = makeDataSource(makeOrg());
      const { events, emitSpy } = makeEvents();
      const svc = new PrivacyService(ds as never, events);
      const { zip, filename } = await svc.exportOrganization(ORG, USER);
      expect(filename).toMatch(new RegExp(`^nexandro-data-export-${ORG}-\\d{4}-\\d{2}-\\d{2}\\.zip$`));
      // PK ZIP local file signature
      expect(zip.readUInt32LE(0)).toBe(0x04034b50);
      // The EOCD signature lives at the tail (offset = length - 22 with no comment).
      expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
      // Naive sanity check: the manifest filename appears in the buffer.
      const ascii = zip.toString('binary');
      expect(ascii).toContain('manifest.json');
      expect(ascii).toContain('organization.jsonl');
      expect(ascii).toContain('users.jsonl');
      expect(ascii).toContain('audit_log.jsonl');
      expect(ascii).toContain('ingredients.jsonl');
      expect(ascii).toContain('recipes.jsonl');
      expect(ascii).toContain('photos_manifest.jsonl');
      const channels = emitSpy.mock.calls.map((c) => c[0]);
      expect(channels).toContain(AuditEventType.PRIVACY_EXPORT_REQUESTED);
    });

    it('404 when org missing', async () => {
      const { ds } = makeDataSource(null);
      const { events } = makeEvents();
      const svc = new PrivacyService(ds as never, events);
      await expect(svc.exportOrganization(ORG, USER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('survives a missing source table (e.g. fresh DB without all migrations)', async () => {
      const seedDs = makeDataSource(makeOrg());
      // Force the dump-table query to throw — should be swallowed.
      (seedDs.ds.query as jest.Mock).mockRejectedValue(new Error('relation does not exist'));
      const { events } = makeEvents();
      const svc = new PrivacyService(seedDs.ds as never, events);
      const result = await svc.exportOrganization(ORG, USER);
      // The export still completes — the manifest just records 0 rows.
      expect(result.zip.length).toBeGreaterThan(100);
    });
  });
});
