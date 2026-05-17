import { randomUUID } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { LotRepository } from '../../lot/application/lot.repository';
import { Lot } from '../../lot/domain/lot.entity';
import {
  ExpiryDedupWindowConflictError,
} from '../domain/errors';
import { ExpiryAlertsFired } from '../domain/expiry-alerts-fired.entity';
import { LOT_EXPIRY_NEAR_CHANNEL } from '../domain/events';
import { ExpiryAlertsFiredRepository } from './expiry-alerts-fired.repository';
import { ExpiryScannerService } from './expiry-scanner.service';

/**
 * Build a Lot entity instance bypassing the validator (the validator
 * rejects past expiry; this spec needs precise control over expires_at).
 */
function buildLot(overrides: Partial<Lot> = {}): Lot {
  const l = new Lot();
  l.id = overrides.id ?? randomUUID();
  l.organizationId = overrides.organizationId ?? randomUUID();
  l.locationId = overrides.locationId ?? randomUUID();
  l.supplierId = overrides.supplierId ?? randomUUID();
  l.receivedAt = overrides.receivedAt ?? new Date('2026-05-01T00:00:00Z');
  l.expiresAt = overrides.expiresAt ?? new Date('2026-05-16T00:00:00Z');
  l.quantityReceived = overrides.quantityReceived ?? 10;
  l.quantityRemaining = overrides.quantityRemaining ?? 10;
  l.unit = overrides.unit ?? 'kg';
  l.metadata = overrides.metadata ?? {};
  l.createdAt = overrides.createdAt ?? new Date();
  l.updatedAt = overrides.updatedAt ?? new Date();
  return l;
}

interface Harness {
  service: ExpiryScannerService;
  lotsByBand: Map<number, Lot[]>;
  firedRows: ExpiryAlertsFired[];
  emitted: Array<{ channel: string; payload: unknown }>;
  setRecent: (
    org: string,
    lotId: string,
    band: 't-72h' | 't-24h',
    row: ExpiryAlertsFired | null,
  ) => void;
  recordFiredImpl: jest.Mock;
}

async function makeHarness(opts: {
  lotsByBand?: Map<number, Lot[]>;
  recordFiredImpl?: jest.Mock;
} = {}): Promise<Harness> {
  const lotsByBand = opts.lotsByBand ?? new Map<number, Lot[]>();
  const recentMap = new Map<string, ExpiryAlertsFired | null>();
  const firedRows: ExpiryAlertsFired[] = [];
  const emitted: Array<{ channel: string; payload: unknown }> = [];

  const lots: Partial<LotRepository> = {
    findByExpiryWindow: jest.fn(
      async (_org: string, withinHours: number) =>
        lotsByBand.get(withinHours) ?? [],
    ),
    findDistinctOrgsWithExpiryIn: jest.fn(async () => {
      const orgs = new Set<string>();
      for (const arr of lotsByBand.values()) {
        for (const l of arr) orgs.add(l.organizationId);
      }
      return Array.from(orgs);
    }),
  };

  const defaultRecordFired = jest.fn(
    async (input: {
      organizationId: string;
      lotId: string;
      alertBand: 't-72h' | 't-24h';
      expiresAtSnapshot: Date;
      firedAt?: Date;
    }) => {
      const row = ExpiryAlertsFired.create(input);
      firedRows.push(row);
      return row;
    },
  );

  const fired: Partial<ExpiryAlertsFiredRepository> = {
    findRecentFor: jest.fn(
      async (
        org: string,
        lotId: string,
        band: 't-72h' | 't-24h',
        _within: number,
      ) => recentMap.get(`${org}|${lotId}|${band}`) ?? null,
    ),
    recordFired: opts.recordFiredImpl ?? defaultRecordFired,
  };

  const events: Partial<EventEmitter2> = {
    emitAsync: jest.fn(async (channel: string, payload: unknown) => {
      emitted.push({ channel, payload });
      return [];
    }) as unknown as EventEmitter2['emitAsync'],
  };

  const mod: TestingModule = await Test.createTestingModule({
    providers: [
      ExpiryScannerService,
      { provide: LotRepository, useValue: lots },
      { provide: ExpiryAlertsFiredRepository, useValue: fired },
      { provide: EventEmitter2, useValue: events },
    ],
  }).compile();

  return {
    service: mod.get(ExpiryScannerService),
    lotsByBand,
    firedRows,
    emitted,
    setRecent: (org, lotId, band, row) =>
      recentMap.set(`${org}|${lotId}|${band}`, row),
    recordFiredImpl: (fired.recordFired as jest.Mock) ?? defaultRecordFired,
  };
}

describe('ExpiryScannerService', () => {
  const ORIG_ENV = process.env.NEXANDRO_EXPIRY_SCANNER_ENABLED;

  beforeEach(() => {
    process.env.NEXANDRO_EXPIRY_SCANNER_ENABLED = 'true';
  });

  afterAll(() => {
    if (ORIG_ENV === undefined) {
      delete process.env.NEXANDRO_EXPIRY_SCANNER_ENABLED;
    } else {
      process.env.NEXANDRO_EXPIRY_SCANNER_ENABLED = ORIG_ENV;
    }
  });

  it('emits one event + writes one fired row for a fresh lot in t-72h window', async () => {
    const lot = buildLot({
      expiresAt: new Date(Date.now() + 71 * 3600 * 1000),
    });
    const lotsByBand = new Map<number, Lot[]>([[72, [lot]], [24, []]]);
    const h = await makeHarness({ lotsByBand });
    await h.service.runTick();
    const t72 = h.emitted.filter(
      (e) =>
        (e.payload as { payloadAfter: { alert_band: string } }).payloadAfter
          .alert_band === 't-72h',
    );
    expect(t72).toHaveLength(1);
    expect(t72[0].channel).toBe(LOT_EXPIRY_NEAR_CHANNEL);
    expect(h.firedRows).toHaveLength(1);
    expect(h.firedRows[0].alertBand).toBe('t-72h');
  });

  it('suppresses second tick within 23h when prior fired row exists', async () => {
    const lot = buildLot({
      expiresAt: new Date(Date.now() + 23 * 3600 * 1000),
    });
    const lotsByBand = new Map<number, Lot[]>([[72, [lot]], [24, [lot]]]);
    const h = await makeHarness({ lotsByBand });
    // pretend t-72h + t-24h already fired
    const prior72 = ExpiryAlertsFired.create({
      organizationId: lot.organizationId,
      lotId: lot.id,
      alertBand: 't-72h',
      expiresAtSnapshot: lot.expiresAt!,
    });
    const prior24 = ExpiryAlertsFired.create({
      organizationId: lot.organizationId,
      lotId: lot.id,
      alertBand: 't-24h',
      expiresAtSnapshot: lot.expiresAt!,
    });
    h.setRecent(lot.organizationId, lot.id, 't-72h', prior72);
    h.setRecent(lot.organizationId, lot.id, 't-24h', prior24);
    await h.service.runTick();
    expect(h.emitted).toHaveLength(0);
    expect(h.firedRows).toHaveLength(0);
  });

  it('emits both t-72h and t-24h when a lot is in both bands', async () => {
    const lot = buildLot({
      expiresAt: new Date(Date.now() + 23 * 3600 * 1000),
    });
    const lotsByBand = new Map<number, Lot[]>([[72, [lot]], [24, [lot]]]);
    const h = await makeHarness({ lotsByBand });
    await h.service.runTick();
    const bands = h.emitted.map(
      (e) =>
        (e.payload as { payloadAfter: { alert_band: string } }).payloadAfter
          .alert_band,
    );
    expect(bands.sort()).toEqual(['t-24h', 't-72h']);
    expect(h.firedRows).toHaveLength(2);
  });

  it('continues processing remaining lots when one lot emit fails', async () => {
    const lotOk1 = buildLot({
      expiresAt: new Date(Date.now() + 60 * 3600 * 1000),
    });
    const lotFail = buildLot({
      expiresAt: new Date(Date.now() + 50 * 3600 * 1000),
    });
    const lotOk2 = buildLot({
      expiresAt: new Date(Date.now() + 40 * 3600 * 1000),
    });
    // all three orgs unique → discoverActiveOrgs returns 3 orgs, each
    // with 1 lot. Simulate failure on lotFail's org by making
    // recordFired throw for that lotId only.
    const recordFiredImpl = jest.fn(
      async (input: {
        organizationId: string;
        lotId: string;
        alertBand: 't-72h' | 't-24h';
        expiresAtSnapshot: Date;
        firedAt?: Date;
      }) => {
        if (input.lotId === lotFail.id) {
          throw new Error('synthetic DB blip');
        }
        return ExpiryAlertsFired.create(input);
      },
    );
    const lotsByBand = new Map<number, Lot[]>([
      [72, [lotOk1, lotFail, lotOk2]],
      [24, []],
    ]);
    const h = await makeHarness({ lotsByBand, recordFiredImpl });
    await h.service.runTick();
    // 2 successes despite the middle failure.
    // Filter to the t-72h channel since per-org `findByExpiryWindow`
    // is shared across the 3 orgs but our mock returns the same list
    // for every org call — guarantee at least 2 successful emits.
    expect(h.emitted.length).toBeGreaterThanOrEqual(2);
  });

  it('catches dedup race (ExpiryDedupWindowConflictError) without emitting', async () => {
    const lot = buildLot({
      expiresAt: new Date(Date.now() + 60 * 3600 * 1000),
    });
    const recordFiredImpl = jest.fn(async () => {
      throw new ExpiryDedupWindowConflictError(lot.id, 't-72h');
    });
    const lotsByBand = new Map<number, Lot[]>([[72, [lot]], [24, []]]);
    const h = await makeHarness({ lotsByBand, recordFiredImpl });
    await h.service.runTick();
    expect(h.emitted).toHaveLength(0);
  });

  it('short-circuits when NEXANDRO_EXPIRY_SCANNER_ENABLED !== "true"', async () => {
    process.env.NEXANDRO_EXPIRY_SCANNER_ENABLED = 'false';
    const lot = buildLot({
      expiresAt: new Date(Date.now() + 1 * 3600 * 1000),
    });
    const lotsByBand = new Map<number, Lot[]>([[72, [lot]], [24, [lot]]]);
    const h = await makeHarness({ lotsByBand });
    await h.service.runTick();
    expect(h.emitted).toHaveLength(0);
    expect(h.firedRows).toHaveLength(0);
  });

  it('populates payload with location_id, supplier_id, unit, and hours_until_expiry', async () => {
    const lot = buildLot({
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      unit: 'g',
      quantityRemaining: 250.5,
    });
    const lotsByBand = new Map<number, Lot[]>([[72, [lot]], [24, [lot]]]);
    const h = await makeHarness({ lotsByBand });
    await h.service.runTick();
    const t24 = h.emitted.find(
      (e) =>
        (e.payload as { payloadAfter: { alert_band: string } }).payloadAfter
          .alert_band === 't-24h',
    );
    expect(t24).toBeDefined();
    const payload = (
      t24!.payload as {
        payloadAfter: {
          location_id: string;
          supplier_id: string | null;
          unit: string;
          quantity_remaining: number;
          hours_until_expiry: number;
        };
      }
    ).payloadAfter;
    expect(payload.location_id).toBe(lot.locationId);
    expect(payload.supplier_id).toBe(lot.supplierId);
    expect(payload.unit).toBe('g');
    expect(payload.quantity_remaining).toBe(250.5);
    expect(payload.hours_until_expiry).toBeGreaterThanOrEqual(23);
    expect(payload.hours_until_expiry).toBeLessThanOrEqual(24);
  });
});
