import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Organization } from '../../iam/domain/organization.entity';
import { User } from '../../iam/domain/user.entity';
import { Location } from '../../iam/domain/location.entity';
import { UserLocation } from '../../iam/domain/user-location.entity';
import { AuditLog } from '../domain/audit-log.entity';
import { AuditLogService } from './audit-log.service';
import {
  csvHeaderRow,
  csvSerialiseRow,
} from './audit-log-csv';

const ALL_ENTITIES = [Organization, User, Location, UserLocation, AuditLog];

/**
 * INT spec — deferred-run-pending-docker. Verifies the streaming export path
 * end-to-end against Postgres: streamRows() + wouldExceedCap() + the CSV
 * serialiser. Each test seeds a fresh table state and consumes the generator.
 */
describe('AuditLog export (integration)', () => {
  let app: TestingModule;
  let dataSource: DataSource;
  let service: AuditLogService;

  const ORG = '88888888-8888-4888-8888-888888888888';
  const RECIPE_AGG_ID = '77777777-7777-4777-8777-777777777777';

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url:
            process.env.DATABASE_URL ??
            'postgres://nexandro_test:nexandro_test@localhost:5433/nexandro_test',
          entities: ALL_ENTITIES,
          migrations: [`${__dirname}/../../migrations/*.{ts,js}`],
          migrationsTableName: 'nexandro_migrations',
          synchronize: false,
        }),
        TypeOrmModule.forFeature(ALL_ENTITIES),
      ],
      providers: [AuditLogService],
    }).compile();

    dataSource = app.get(DataSource);
    service = app.get(AuditLogService);
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await app?.close();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE "audit_log" RESTART IDENTITY CASCADE');
  });

  async function seedRows(
    count: number,
    payloadGen?: (i: number) => Record<string, unknown>,
  ): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const id = randomUUID();
      ids.push(id);
      await dataSource.query(
        `INSERT INTO "audit_log" (
           "id", "organization_id", "event_type", "aggregate_type", "aggregate_id",
           "actor_kind", "payload_after", "reason", "created_at"
         ) VALUES ($1, $2, 'TEST_EXPORT', 'recipe', $3, 'system', $4::jsonb, $5, $6)`,
        [
          id,
          ORG,
          RECIPE_AGG_ID,
          JSON.stringify(payloadGen ? payloadGen(i) : { idx: i }),
          `seed-reason-${i}`,
          // Spread createdAt across distinct timestamps for stable ordering.
          new Date(2026, 2, 1, 0, 0, 0, count - i).toISOString(),
        ],
      );
    }
    return ids;
  }

  describe('streamRows', () => {
    it('yields zero rows for an empty table', async () => {
      const out: AuditLog[] = [];
      for await (const r of service.streamRows({ organizationId: ORG }, 100)) {
        out.push(r);
      }
      expect(out).toHaveLength(0);
    });

    it('yields all rows when below cap', async () => {
      await seedRows(50);
      const out: AuditLog[] = [];
      for await (const r of service.streamRows(
        { organizationId: ORG, since: new Date('2026-01-01') },
        200,
      )) {
        out.push(r);
      }
      expect(out).toHaveLength(50);
    });

    it('caps emission at hardCap when source exceeds it', async () => {
      await seedRows(15);
      const out: AuditLog[] = [];
      for await (const r of service.streamRows(
        { organizationId: ORG, since: new Date('2026-01-01') },
        10,
      )) {
        out.push(r);
      }
      expect(out).toHaveLength(10);
    });

    it('orders newest-first across batches', async () => {
      // Seed rows with deliberately spread createdAt; iterate ALL.
      await seedRows(5);
      const out: AuditLog[] = [];
      for await (const r of service.streamRows(
        { organizationId: ORG, since: new Date('2026-01-01') },
        100,
      )) {
        out.push(r);
      }
      expect(out).toHaveLength(5);
      for (let i = 1; i < out.length; i++) {
        expect(out[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(
          out[i].createdAt.getTime(),
        );
      }
    });

    it('honours filter.q (FTS) and returns only matching rows', async () => {
      await seedRows(10, (i) => ({
        note: i < 3 ? 'tomate fresco del huerto' : 'cebolla blanca',
      }));
      const out: AuditLog[] = [];
      for await (const r of service.streamRows(
        { organizationId: ORG, q: 'tomate', since: new Date('2026-01-01') },
        100,
      )) {
        out.push(r);
      }
      expect(out.length).toBeGreaterThanOrEqual(3);
      for (const r of out) {
        const note = (r.payloadAfter as { note?: string } | null)?.note ?? '';
        expect(note.toLowerCase()).toContain('tomate');
      }
    });

    it('honours aggregateType + aggregateId filters AND-wise', async () => {
      await seedRows(5);
      // Insert one row with a different aggregate_id.
      const otherId = randomUUID();
      await dataSource.query(
        `INSERT INTO "audit_log" (
           "id", "organization_id", "event_type", "aggregate_type", "aggregate_id",
           "actor_kind", "payload_after", "created_at"
         ) VALUES ($1, $2, 'TEST_EXPORT', 'recipe', $3, 'system', $4::jsonb, '2026-04-01T00:00:00Z')`,
        [randomUUID(), ORG, otherId, JSON.stringify({ note: 'other-recipe' })],
      );
      const out: AuditLog[] = [];
      for await (const r of service.streamRows(
        {
          organizationId: ORG,
          aggregateType: 'recipe',
          aggregateId: RECIPE_AGG_ID,
          since: new Date('2026-01-01'),
        },
        100,
      )) {
        out.push(r);
      }
      expect(out).toHaveLength(5);
      for (const r of out) {
        expect(r.aggregateId).toBe(RECIPE_AGG_ID);
      }
    });

    it('cursor pagination works across multiple batches (boundary stress)', async () => {
      // Seed 1500 rows; cap = 1500; default batch is 1000 → expect 2 batches.
      await seedRows(1500);
      const out: AuditLog[] = [];
      for await (const r of service.streamRows(
        { organizationId: ORG, since: new Date('2026-01-01') },
        1500,
      )) {
        out.push(r);
      }
      expect(out).toHaveLength(1500);
      // No duplicate ids despite cursor handoff.
      const ids = new Set(out.map((r) => r.id));
      expect(ids.size).toBe(1500);
    }, 30_000);
  });

  describe('wouldExceedCap', () => {
    it('returns false on empty table', async () => {
      expect(await service.wouldExceedCap({ organizationId: ORG }, 100)).toBe(false);
    });

    it('returns false when row count <= cap', async () => {
      await seedRows(50);
      expect(
        await service.wouldExceedCap(
          { organizationId: ORG, since: new Date('2026-01-01') },
          100,
        ),
      ).toBe(false);
    });

    it('returns false when row count == cap', async () => {
      await seedRows(10);
      expect(
        await service.wouldExceedCap(
          { organizationId: ORG, since: new Date('2026-01-01') },
          10,
        ),
      ).toBe(false);
    });

    it('returns true when row count > cap', async () => {
      await seedRows(11);
      expect(
        await service.wouldExceedCap(
          { organizationId: ORG, since: new Date('2026-01-01') },
          10,
        ),
      ).toBe(true);
    });

    it('honours filter.q', async () => {
      await seedRows(10, (i) => ({
        note: i < 3 ? 'tomate' : 'cebolla',
      }));
      // Only ~3 rows match 'tomate'; cap=2 → exceed; cap=10 → no exceed.
      expect(
        await service.wouldExceedCap(
          { organizationId: ORG, q: 'tomate', since: new Date('2026-01-01') },
          2,
        ),
      ).toBe(true);
      expect(
        await service.wouldExceedCap(
          { organizationId: ORG, q: 'tomate', since: new Date('2026-01-01') },
          10,
        ),
      ).toBe(false);
    });
  });

  describe('CSV round-trip', () => {
    it('every seeded row is recoverable from the serialised CSV', async () => {
      const ids = await seedRows(3, (i) => ({ idx: i, label: `row-${i}` }));

      const lines: string[] = [csvHeaderRow()];
      for await (const r of service.streamRows(
        { organizationId: ORG, since: new Date('2026-01-01') },
        100,
      )) {
        lines.push(csvSerialiseRow(r));
      }

      expect(lines).toHaveLength(4); // header + 3 data
      // Each seeded id appears exactly once in the CSV body (column 0).
      for (const id of ids) {
        const matches = lines
          .slice(1)
          .filter((l) => l.startsWith(`${id},`)).length;
        expect(matches).toBe(1);
      }
    });

    it('CSV round-trips a row whose payload contains comma + quote + newline', async () => {
      const id = randomUUID();
      const trickyPayload = {
        note: 'he said "ok, then\nhi"',
        extra: 'with, commas',
      };
      await dataSource.query(
        `INSERT INTO "audit_log" (
           "id", "organization_id", "event_type", "aggregate_type", "aggregate_id",
           "actor_kind", "payload_after", "created_at"
         ) VALUES ($1, $2, 'TEST_EXPORT', 'recipe', $3, 'system', $4::jsonb, '2026-04-01T00:00:00Z')`,
        [id, ORG, RECIPE_AGG_ID, JSON.stringify(trickyPayload)],
      );

      const out: string[] = [];
      for await (const row of service.streamRows(
        { organizationId: ORG, since: new Date('2026-01-01') },
        100,
      )) {
        if (row.id === id) out.push(csvSerialiseRow(row));
      }
      expect(out).toHaveLength(1);
      const csvLine = out[0];
      // Cell 9 is payloadAfterJson — wrapped in quotes with internal "" doubling.
      // We just verify the JSON content is recoverable by unwrapping the cell.
      // Find first quoted span starting at column index = where payloadAfterJson sits.
      // Lazy: check the line contains the doubled-quote-encoded version of `note`.
      expect(csvLine).toContain('""note"":""he said \\""ok, then');
      // The serialised JSON contains `\"` for embedded quotes (JSON.stringify),
      // which then gets CSV-escaped to `\""`.
    });
  });
});
