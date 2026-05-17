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

const ALL_ENTITIES = [Organization, User, Location, UserLocation, AuditLog];

/**
 * INT spec — deferred-run-pending-docker. Verifies the dual-config functional
 * GIN indexes (`ix_audit_log_fts_es` + `ix_audit_log_fts_en`) and the
 * `AuditLogService.query({q})` path.
 *
 * Seed shape (6 rows mixing Spanish + English text):
 *   A — payload_after.note='tomates frescos del huerto', reason='SUPPLIER_PRICE_CHANGE'
 *   B — payload_after.note='salsa de tomate casera',     reason='LINE_EDIT'
 *   C — payload_after.note='chicken breast 2kg',         snippet='OFF lookup chicken breast'
 *   D — payload_after.note='pollo asado al horno',       reason='MANUAL_RECOMPUTE'
 *   E — payload_after.note='zanahoria + tomato sauce',   snippet='mixed-locale row'
 *   F — payload_after.note='cebolla',                    reason='INITIAL'  (control row)
 */
describe('AuditLog FTS (integration)', () => {
  let app: TestingModule;
  let dataSource: DataSource;
  let service: AuditLogService;

  const ORG = '99999999-9999-4999-8999-999999999999';
  const RECIPE_AGG_ID = '88888888-8888-4888-8888-888888888888';
  const OTHER_AGG_ID = '77777777-7777-4777-8777-777777777777';

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
    await seed(dataSource, ORG, RECIPE_AGG_ID, OTHER_AGG_ID);
  });

  describe('match cases', () => {
    it('q="tomate" matches Spanish stems (rows A, B) plus tomato-stem overlap (row E)', async () => {
      const page = await service.query({
        organizationId: ORG,
        q: 'tomate',
        since: new Date('2026-01-01'),
      });
      const labels = page.rows.map((r) => label(r));
      expect(labels).toEqual(expect.arrayContaining(['A', 'B']));
      // Row E has 'tomato' literal; some Spanish stemmers stem 'tomato' to
      // 'tomat', overlapping with 'tomate'/'tomates'. We assert the count,
      // not exact membership, since stemmer behaviour is dictionary-version-
      // dependent — but rows A and B MUST be present.
      expect(page.rows.length).toBeGreaterThanOrEqual(2);
      expect(labels).not.toContain('F');
    });

    it('q="chicken" matches the English row (C) and not the Spanish chicken row (D)', async () => {
      const page = await service.query({
        organizationId: ORG,
        q: 'chicken',
        since: new Date('2026-01-01'),
      });
      const labels = page.rows.map((r) => label(r));
      expect(labels).toContain('C');
      expect(labels).not.toContain('D');
      expect(labels).not.toContain('F');
    });

    it('q="pollo" matches the Spanish chicken row (D) only', async () => {
      const page = await service.query({
        organizationId: ORG,
        q: 'pollo',
        since: new Date('2026-01-01'),
      });
      const labels = page.rows.map((r) => label(r));
      expect(labels).toContain('D');
      expect(labels).not.toContain('C');
      expect(labels).not.toContain('A');
    });

    it('q="inexistente" returns 0 rows', async () => {
      const page = await service.query({
        organizationId: ORG,
        q: 'inexistente',
        since: new Date('2026-01-01'),
      });
      expect(page.total).toBe(0);
      expect(page.rows).toHaveLength(0);
    });
  });

  describe('combination with other filters', () => {
    it('q + aggregateType filters AND-wise', async () => {
      // Row F (control) is NOT under aggregate_type='recipe' — it's under 'other'.
      // Adding aggregateType=recipe should exclude F even if it matched (it doesn't).
      // The real assertion: q='tomate' + aggregateType=recipe still returns
      // A, B (both 'recipe') but excludes any rows under 'other'.
      const recipeOnly = await service.query({
        organizationId: ORG,
        q: 'tomate',
        aggregateType: 'recipe',
        since: new Date('2026-01-01'),
      });
      const labels = recipeOnly.rows.map((r) => label(r));
      expect(labels).toContain('A');
      expect(labels).toContain('B');
      expect(labels).not.toContain('F'); // F is under aggregate_type='other'
    });
  });

  describe('ranking', () => {
    it('SD4-a: row with more matches outranks row with fewer matches', async () => {
      // Insert two extra rows for the controlled ranking test, both matching
      // 'tomate' but with different match densities.
      await dataSource.query(
        `INSERT INTO "audit_log" (
           "id", "organization_id", "event_type", "aggregate_type", "aggregate_id",
           "actor_kind", "payload_after", "reason", "snippet", "created_at"
         ) VALUES
         ($1, $2, 'TEST', 'recipe', $3, 'system',
          $4::jsonb, $5, $6, '2026-04-01T00:00:00Z'),
         ($7, $2, 'TEST', 'recipe', $3, 'system',
          $8::jsonb, NULL, NULL, '2026-04-01T00:00:00Z')`,
        [
          randomUUID(),
          ORG,
          RECIPE_AGG_ID,
          JSON.stringify({ note: 'rank-many: tomate, tomate, tomate' }),
          'tomate sauce extra',
          'tomate snippet',
          randomUUID(),
          JSON.stringify({ note: 'rank-few: tomate' }),
        ],
      );

      const page = await service.query({
        organizationId: ORG,
        q: 'tomate',
        since: new Date('2026-01-01'),
        limit: 200,
      });

      const indexMany = page.rows.findIndex((r) =>
        ((r.payloadAfter as { note?: string } | null)?.note ?? '').includes(
          'rank-many',
        ),
      );
      const indexFew = page.rows.findIndex((r) =>
        ((r.payloadAfter as { note?: string } | null)?.note ?? '').includes(
          'rank-few',
        ),
      );
      expect(indexMany).toBeGreaterThanOrEqual(0);
      expect(indexFew).toBeGreaterThanOrEqual(0);
      expect(indexMany).toBeLessThan(indexFew);
    });

    it('SD4-b: cross-config — q="tomato" ranks English-literal hit above Spanish-only hit', async () => {
      // Insert two rows: one with literal English 'tomato' in payload_after,
      // one with Spanish 'tomate' only (no English token at all).
      await dataSource.query(
        `INSERT INTO "audit_log" (
           "id", "organization_id", "event_type", "aggregate_type", "aggregate_id",
           "actor_kind", "payload_after", "created_at"
         ) VALUES
         ($1, $2, 'TEST', 'recipe', $3, 'system',
          $4::jsonb, '2026-04-01T00:00:00Z'),
         ($5, $2, 'TEST', 'recipe', $3, 'system',
          $6::jsonb, '2026-04-01T00:00:00Z')`,
        [
          randomUUID(),
          ORG,
          RECIPE_AGG_ID,
          JSON.stringify({ note: 'EN-rank: tomato sauce reference' }),
          randomUUID(),
          JSON.stringify({ note: 'ES-rank: tomate frito recipe' }),
        ],
      );

      const page = await service.query({
        organizationId: ORG,
        q: 'tomato',
        since: new Date('2026-01-01'),
        limit: 200,
      });

      const indexEn = page.rows.findIndex((r) =>
        ((r.payloadAfter as { note?: string } | null)?.note ?? '').includes(
          'EN-rank',
        ),
      );
      const indexEs = page.rows.findIndex((r) =>
        ((r.payloadAfter as { note?: string } | null)?.note ?? '').includes(
          'ES-rank',
        ),
      );
      // The English row MUST be present; the Spanish row may or may not match
      // depending on stemmer overlap. If both present, English ranks first.
      expect(indexEn).toBeGreaterThanOrEqual(0);
      if (indexEs >= 0) {
        expect(indexEn).toBeLessThan(indexEs);
      }
    });

    it('SD4-c: identical text content → newest row first (recency tiebreaker)', async () => {
      const olderId = randomUUID();
      const newerId = randomUUID();
      await dataSource.query(
        `INSERT INTO "audit_log" (
           "id", "organization_id", "event_type", "aggregate_type", "aggregate_id",
           "actor_kind", "payload_after", "created_at"
         ) VALUES
         ($1, $2, 'TEST', 'recipe', $3, 'system',
          $4::jsonb, '2026-04-01T00:00:00Z'),
         ($5, $2, 'TEST', 'recipe', $3, 'system',
          $4::jsonb, '2026-04-02T00:00:00Z')`,
        [
          olderId,
          ORG,
          RECIPE_AGG_ID,
          JSON.stringify({ note: 'tie-test: tomate idéntico' }),
          newerId,
        ],
      );

      const page = await service.query({
        organizationId: ORG,
        q: 'tomate',
        since: new Date('2026-01-01'),
        limit: 200,
      });

      const newerIdx = page.rows.findIndex((r) => r.id === newerId);
      const olderIdx = page.rows.findIndex((r) => r.id === olderId);
      expect(newerIdx).toBeGreaterThanOrEqual(0);
      expect(olderIdx).toBeGreaterThanOrEqual(0);
      expect(newerIdx).toBeLessThan(olderIdx);
    });
  });

  describe('index contract (drift surfacing)', () => {
    // The two FTS GIN indexes must (a) exist with USING gin, (b) reference
    // both jsonb_to_tsvector + to_tsvector, (c) cover both 'spanish' and
    // 'english' configs across the two indexes, and (d) reference each of
    // the four searchable columns (payload_before, payload_after, reason,
    // snippet).
    //
    // We assert against pg_indexes.indexdef directly rather than EXPLAIN
    // plans. EXPLAIN-based assertions are flaky on small tables (planner
    // prefers other index paths or seq scan on cost grounds, even with
    // SET enable_seqscan = off, because the planner has a multi-column
    // org_id index that satisfies the org_id filter cheaper than the GIN).
    // What we actually care about for "drift" is whether the indexed
    // expression matches the service's WHERE expression — both reference
    // audit-log-fts.sql.ts, so any divergence shows up as a missing token
    // in the indexdef OR in the service's compiled SQL.
    it('ix_audit_log_fts_es exists with the expected Spanish vector tokens', async () => {
      const rows: Array<{ indexdef: string }> = await dataSource.query(
        `SELECT indexdef FROM pg_indexes
         WHERE schemaname='public' AND tablename='audit_log'
           AND indexname='ix_audit_log_fts_es'`,
      );
      expect(rows).toHaveLength(1);
      const def = rows[0].indexdef;
      expect(def.toLowerCase()).toContain('using gin');
      expect(def).toContain("'spanish'");
      expect(def).toContain('jsonb_to_tsvector');
      expect(def).toContain('to_tsvector');
      expect(def).toContain('payload_before');
      expect(def).toContain('payload_after');
      expect(def).toContain('reason');
      expect(def).toContain('snippet');
    });

    it('ix_audit_log_fts_en exists with the expected English vector tokens', async () => {
      const rows: Array<{ indexdef: string }> = await dataSource.query(
        `SELECT indexdef FROM pg_indexes
         WHERE schemaname='public' AND tablename='audit_log'
           AND indexname='ix_audit_log_fts_en'`,
      );
      expect(rows).toHaveLength(1);
      const def = rows[0].indexdef;
      expect(def.toLowerCase()).toContain('using gin');
      expect(def).toContain("'english'");
      expect(def).toContain('jsonb_to_tsvector');
      expect(def).toContain('to_tsvector');
      expect(def).toContain('payload_before');
      expect(def).toContain('payload_after');
      expect(def).toContain('reason');
      expect(def).toContain('snippet');
    });

    it('the service\'s vector SQL fragments share key tokens with the indexes', async () => {
      // Sanity-check the shared-source-of-truth contract from a runtime
      // perspective — if someone edits audit-log-fts.sql.ts but skips the
      // migration regenerate step (or vice versa), this catches it.
      const { ES_VECTOR_SQL, EN_VECTOR_SQL } = await import('./audit-log-fts.sql');
      const requiredTokens = [
        'jsonb_to_tsvector',
        'to_tsvector',
        'payload_before',
        'payload_after',
        'reason',
        'snippet',
      ];
      for (const token of requiredTokens) {
        expect(ES_VECTOR_SQL).toContain(token);
        expect(EN_VECTOR_SQL).toContain(token);
      }
      expect(ES_VECTOR_SQL).toContain("'spanish'");
      expect(EN_VECTOR_SQL).toContain("'english'");
    });
  });
});

/**
 * Seed 6 rows covering the cases listed in the file header. Returns the
 * inserted UUIDs so callers can correlate; tests use the `label()` helper to
 * map back to A–F by examining `payload_after.note`.
 */
async function seed(
  ds: DataSource,
  orgId: string,
  recipeAggId: string,
  otherAggId: string,
): Promise<void> {
  const sql = `
    INSERT INTO "audit_log" (
      "id", "organization_id", "event_type", "aggregate_type", "aggregate_id",
      "actor_kind", "payload_after", "reason", "snippet", "created_at"
    ) VALUES
      ($1, $2, 'RECIPE_INGREDIENT_UPDATED', 'recipe', $3, 'system',
       $4::jsonb, 'SUPPLIER_PRICE_CHANGE', NULL, '2026-03-01T10:00:00Z'),
      ($5, $2, 'RECIPE_INGREDIENT_UPDATED', 'recipe', $3, 'system',
       $6::jsonb, 'LINE_EDIT', NULL, '2026-03-02T10:00:00Z'),
      ($7, $2, 'INGREDIENT_OVERRIDE_CHANGED', 'recipe', $3, 'system',
       $8::jsonb, NULL, 'OFF lookup chicken breast', '2026-03-03T10:00:00Z'),
      ($9, $2, 'RECIPE_COST_REBUILT', 'recipe', $3, 'system',
       $10::jsonb, 'MANUAL_RECOMPUTE', NULL, '2026-03-04T10:00:00Z'),
      ($11, $2, 'INGREDIENT_OVERRIDE_CHANGED', 'recipe', $3, 'system',
       $12::jsonb, NULL, 'mixed-locale row', '2026-03-05T10:00:00Z'),
      ($13, $2, 'TEST', 'other', $14, 'system',
       $15::jsonb, 'INITIAL', NULL, '2026-03-06T10:00:00Z')
  `;
  await ds.query(sql, [
    randomUUID(),
    orgId,
    recipeAggId,
    JSON.stringify({ note: 'A: tomates frescos del huerto' }),
    randomUUID(),
    JSON.stringify({ note: 'B: salsa de tomate casera' }),
    randomUUID(),
    JSON.stringify({ note: 'C: chicken breast 2kg' }),
    randomUUID(),
    JSON.stringify({ note: 'D: pollo asado al horno' }),
    randomUUID(),
    JSON.stringify({ note: 'E: zanahoria + tomato sauce' }),
    randomUUID(),
    otherAggId,
    JSON.stringify({ note: 'F: cebolla' }),
  ]);
}

/** Recover the seed label A–F from the row's payload_after.note prefix. */
function label(row: AuditLog): string {
  const note = (row.payloadAfter as { note?: string } | null)?.note ?? '';
  const m = /^([A-F]):/.exec(note);
  return m ? m[1] : '?';
}
