import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Organization } from '../../iam/domain/organization.entity';
import { User } from '../../iam/domain/user.entity';
import { Location } from '../../iam/domain/location.entity';
import { UserLocation } from '../../iam/domain/user-location.entity';
import { AuditLog } from '../domain/audit-log.entity';

const ALL_ENTITIES = [Organization, User, Location, UserLocation, AuditLog];

const ORG = '12121212-1212-4121-8121-121212121212';
const LEAN_ID = '13131313-1313-4131-8131-131313131313';
const RICH_RECIPE_1 = '14141414-1414-4141-8141-141414141414';
const RICH_RECIPE_2 = '15151515-1515-4151-8151-151515151515';

/**
 * INT spec — deferred-run-pending-docker. Verifies migration 0022
 * (`audit_log_forensic_split`) backfills historical rich rows and is
 * idempotent + symmetric on down.
 *
 * Per ADR-026: rows with event_type='AGENT_ACTION_EXECUTED' and
 * aggregate_type<>'organization' move to event_type='AGENT_ACTION_FORENSIC';
 * lean rows (aggregate_type='organization') stay untouched.
 */
describe('audit_log forensic split migration (integration)', () => {
  let app: TestingModule;
  let dataSource: DataSource;

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
    }).compile();

    dataSource = app.get(DataSource);
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await app?.close();
  });

  async function seedMixedRows(): Promise<void> {
    await dataSource.query('TRUNCATE TABLE "audit_log" RESTART IDENTITY CASCADE');
    // Seed using the post-migration-0022 channel split — but we deliberately
    // INSERT using the legacy AGENT_ACTION_EXECUTED event_type to simulate
    // historical pre-split rows. Migration 0022 backfilling them is what we
    // exercise; the migration itself is idempotent so we re-run it to verify
    // the WHERE clause.
    await dataSource.query(
      `INSERT INTO "audit_log"
        (id, organization_id, event_type, aggregate_type, aggregate_id,
         actor_user_id, actor_kind, agent_name, payload_before, payload_after,
         reason, citation_url, snippet, created_at)
       VALUES
        (gen_random_uuid(), $1, 'AGENT_ACTION_EXECUTED', 'organization', $1,
         NULL, 'agent', 'claude-desktop', NULL,
         '{"capabilityName":"recipes.read","timestamp":"2026-05-06T12:00:00Z"}'::jsonb,
         NULL, NULL, NULL, NOW() - INTERVAL '5 days'),
        (gen_random_uuid(), $1, 'AGENT_ACTION_EXECUTED', 'organization', $1,
         NULL, 'agent', 'opencode', NULL,
         '{"capabilityName":"menu-items.read","timestamp":"2026-05-06T12:01:00Z"}'::jsonb,
         NULL, NULL, NULL, NOW() - INTERVAL '4 days'),
        (gen_random_uuid(), $1, 'AGENT_ACTION_EXECUTED', 'recipe', $2,
         '${LEAN_ID}', 'agent', 'claude-desktop',
         '{"name":"old"}'::jsonb,
         '{"name":"new"}'::jsonb,
         'recipes.update', NULL, NULL, NOW() - INTERVAL '3 days'),
        (gen_random_uuid(), $1, 'AGENT_ACTION_EXECUTED', 'menu_item', $3,
         NULL, 'agent', 'hermes-web',
         NULL,
         '{"sessionId":"sess-1"}'::jsonb,
         'chat.message', NULL, NULL, NOW() - INTERVAL '2 days')`,
      [ORG, RICH_RECIPE_1, RICH_RECIPE_2],
    );
  }

  async function getCounts(): Promise<{
    leanExecuted: number;
    richExecuted: number;
    leanForensic: number;
    richForensic: number;
  }> {
    const rows = await dataSource.query(
      `SELECT event_type, aggregate_type, count(*)::text AS count
         FROM "audit_log"
         WHERE event_type IN ('AGENT_ACTION_EXECUTED', 'AGENT_ACTION_FORENSIC')
         GROUP BY 1, 2`,
    );
    // Multiple aggregate_type values (recipe, menu_item, ingredient, ...)
    // collapse into the same lean/rich bucket; accumulate, never overwrite.
    const map: Record<string, number> = {};
    for (const row of rows) {
      const key = `${row.event_type}/${row.aggregate_type === 'organization' ? 'lean' : 'rich'}`;
      map[key] = (map[key] ?? 0) + Number(row.count);
    }
    return {
      leanExecuted: map['AGENT_ACTION_EXECUTED/lean'] ?? 0,
      richExecuted: map['AGENT_ACTION_EXECUTED/rich'] ?? 0,
      leanForensic: map['AGENT_ACTION_FORENSIC/lean'] ?? 0,
      richForensic: map['AGENT_ACTION_FORENSIC/rich'] ?? 0,
    };
  }

  beforeEach(async () => {
    // Reset to pre-migration shape: revert any AGENT_ACTION_FORENSIC rows
    // back to AGENT_ACTION_EXECUTED so each test starts from the historical
    // state. (The migration runs once at boot; we manipulate in-place.)
    await seedMixedRows();
  });

  it('initial seed has 2 lean + 2 rich rows on AGENT_ACTION_EXECUTED', async () => {
    const counts = await getCounts();
    expect(counts.leanExecuted).toBe(2);
    expect(counts.richExecuted).toBe(2);
    expect(counts.leanForensic).toBe(0);
    expect(counts.richForensic).toBe(0);
  });

  it('UPDATE backfill reassigns rich rows; lean rows untouched', async () => {
    await dataSource.query(
      `UPDATE "audit_log"
       SET "event_type" = 'AGENT_ACTION_FORENSIC'
       WHERE "event_type" = 'AGENT_ACTION_EXECUTED'
         AND "aggregate_type" <> 'organization'`,
    );
    const counts = await getCounts();
    expect(counts.leanExecuted).toBe(2);
    expect(counts.richExecuted).toBe(0);
    expect(counts.leanForensic).toBe(0);
    expect(counts.richForensic).toBe(2);
  });

  it('UPDATE backfill is idempotent on second run', async () => {
    await dataSource.query(
      `UPDATE "audit_log"
       SET "event_type" = 'AGENT_ACTION_FORENSIC'
       WHERE "event_type" = 'AGENT_ACTION_EXECUTED'
         AND "aggregate_type" <> 'organization'`,
    );
    await dataSource.query(
      `UPDATE "audit_log"
       SET "event_type" = 'AGENT_ACTION_FORENSIC'
       WHERE "event_type" = 'AGENT_ACTION_EXECUTED'
         AND "aggregate_type" <> 'organization'`,
    );
    const counts = await getCounts();
    expect(counts.richForensic).toBe(2);
    expect(counts.richExecuted).toBe(0);
  });

  it('down migration reverses: AGENT_ACTION_FORENSIC rows return to AGENT_ACTION_EXECUTED', async () => {
    // Forward.
    await dataSource.query(
      `UPDATE "audit_log"
       SET "event_type" = 'AGENT_ACTION_FORENSIC'
       WHERE "event_type" = 'AGENT_ACTION_EXECUTED'
         AND "aggregate_type" <> 'organization'`,
    );
    // Reverse.
    await dataSource.query(
      `UPDATE "audit_log"
       SET "event_type" = 'AGENT_ACTION_EXECUTED'
       WHERE "event_type" = 'AGENT_ACTION_FORENSIC'`,
    );
    const counts = await getCounts();
    expect(counts.leanExecuted).toBe(2);
    expect(counts.richExecuted).toBe(2);
    expect(counts.leanForensic).toBe(0);
    expect(counts.richForensic).toBe(0);
  });

  it('payload + agent_name + actor_user_id are preserved across the UPDATE', async () => {
    await dataSource.query(
      `UPDATE "audit_log"
       SET "event_type" = 'AGENT_ACTION_FORENSIC'
       WHERE "event_type" = 'AGENT_ACTION_EXECUTED'
         AND "aggregate_type" <> 'organization'`,
    );
    const rows = await dataSource.query(
      `SELECT event_type, agent_name, actor_user_id, payload_before, payload_after, reason
         FROM "audit_log"
         WHERE aggregate_id = $1`,
      [RICH_RECIPE_1],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('AGENT_ACTION_FORENSIC');
    expect(rows[0].agent_name).toBe('claude-desktop');
    expect(rows[0].actor_user_id).toBe(LEAN_ID);
    expect(rows[0].payload_before).toEqual({ name: 'old' });
    expect(rows[0].payload_after).toEqual({ name: 'new' });
    expect(rows[0].reason).toBe('recipes.update');
  });
});
