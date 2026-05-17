import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import {
  Injectable,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { NextFunction, Request, Response } from 'express';
import { DataSource } from 'typeorm';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuditLog } from '../audit-log/domain/audit-log.entity';
import { Organization } from '../iam/domain/organization.entity';
import { User, UserRole } from '../iam/domain/user.entity';
import { Location } from '../iam/domain/location.entity';
import { UserLocation } from '../iam/domain/user-location.entity';
import { OrganizationRepository } from '../iam/infrastructure/organization.repository';
import { Category } from '../ingredients/domain/category.entity';
import { Ingredient } from '../ingredients/domain/ingredient.entity';
import { CategoryRepository } from '../ingredients/infrastructure/category.repository';
import { IngredientRepository } from '../ingredients/infrastructure/ingredient.repository';
import { MenuItem } from '../menus/domain/menu-item.entity';
import { Recipe } from '../recipes/domain/recipe.entity';
import { RecipeIngredient } from '../recipes/domain/recipe-ingredient.entity';
import { RecipesModule } from '../recipes/recipes.module';
import { Supplier } from '../suppliers/domain/supplier.entity';
import { SupplierItem } from '../suppliers/domain/supplier-item.entity';

import { AgentIdempotencyKey } from './domain/agent-idempotency-key.entity';
import { AgentCapabilityGuard } from './guards/agent-capability.guard';
import { RolesGuard } from './guards/roles.guard';
import { BeforeAfterAuditInterceptor } from './interceptors/before-after-audit.interceptor';
import { AgentAuditMiddleware } from './middleware/agent-audit.middleware';
import { IdempotencyMiddleware } from './middleware/idempotency.middleware';
import { SharedModule } from './shared.module';

const ALL_ENTITIES = [
  Organization,
  User,
  Location,
  UserLocation,
  Category,
  Ingredient,
  Supplier,
  SupplierItem,
  Recipe,
  RecipeIngredient,
  MenuItem,
  AuditLog,
  AgentIdempotencyKey,
];

/**
 * Test-only middleware that populates `req.user` from `X-Test-*` headers.
 *
 * The production app expects an upstream auth pipe (M3+; Wave 1.5 left this
 * deferred under the "trusted-internal-network" posture). For these INT
 * specs we synthesise the user payload from headers so RolesGuard +
 * AgentCapabilityGuard + the BeforeAfterAuditInterceptor see the same shape
 * they would in production.
 */
@Injectable()
class TestAuthMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const userId = readHeader(req, 'x-test-user-id');
    const orgId = readHeader(req, 'x-test-org-id');
    const role = readHeader(req, 'x-test-user-role') as UserRole | null;
    if (userId && orgId && role) {
      (req as Request & { user?: { userId: string; organizationId: string; role: UserRole } }).user =
        { userId, organizationId: orgId, role };
    }
    next();
  }
}

function readHeader(req: Request, name: string): string | null {
  const raw = req.headers[name];
  if (raw === undefined) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

/**
 * Test module mirroring the cross-cutting wiring of `AppModule` (idempotency
 * middleware + before/after audit interceptor + agent capability guard +
 * agent audit middleware) but limited to the IAM + Recipes + AuditLog
 * surface so the INT spec doesn't drag in the entire BC graph (LabelsModule,
 * AiSuggestionsModule, etc., which need RAG/LightRAG/PrintAdapter
 * dependencies that aren't relevant here).
 */
@Module({
  imports: [
    EventEmitterModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url:
        process.env.DATABASE_URL ??
        'postgres://nexandro_test:nexandro_test@localhost:5433/nexandro_test',
      entities: ALL_ENTITIES,
      migrations: [`${__dirname}/../migrations/*.{ts,js}`],
      migrationsTableName: 'nexandro_migrations',
      synchronize: false,
    }),
    TypeOrmModule.forFeature([
      Organization,
      User,
      Location,
      UserLocation,
      Category,
      Ingredient,
    ]),
    SharedModule,
    RecipesModule,
    AuditLogModule,
  ],
  providers: [
    OrganizationRepository,
    CategoryRepository,
    IngredientRepository,
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: AgentCapabilityGuard },
    { provide: APP_INTERCEPTOR, useClass: BeforeAfterAuditInterceptor },
  ],
})
class TestAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TestAuthMiddleware, AgentAuditMiddleware, IdempotencyMiddleware)
      .forRoutes('*');
  }
}

interface HttpResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

/** Send a request to a Nest INestApplication's underlying server. */
async function sendRequest(
  baseUrl: string,
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<HttpResponse> {
  const url = new URL(path, baseUrl);
  const payload = options.body === undefined ? null : JSON.stringify(options.body);
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...(options.headers ?? {}),
  };
  if (payload !== null) {
    headers['content-type'] = 'application/json';
    headers['content-length'] = String(Buffer.byteLength(payload));
  }
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        method,
        path: url.pathname + url.search,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let body: unknown = null;
          if (text.length > 0) {
            try {
              body = JSON.parse(text);
            } catch {
              body = text;
            }
          }
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body,
          });
        });
      },
    );
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

describe('Agent write capabilities — end-to-end (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let server: http.Server;
  let baseUrl: string;

  let organizations: OrganizationRepository;
  let categories: CategoryRepository;
  let ingredients: IngredientRepository;

  let org: Organization;
  let category: Category;
  let ingredient: Ingredient;
  let userId: string;

  // Env-flag state save+restore so flag toggles don't leak across tests.
  const ENV_KEYS = [
    'NEXANDRO_AGENT_RECIPES_CREATE_ENABLED',
    'NEXANDRO_AGENT_RECIPES_UPDATE_ENABLED',
    'NEXANDRO_AGENT_RECIPES_DELETE_ENABLED',
  ];
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);
    organizations = moduleRef.get(OrganizationRepository);
    categories = moduleRef.get(CategoryRepository);
    ingredients = moduleRef.get(IngredientRepository);

    await dataSource.runMigrations();

    server = app.getHttpServer() as http.Server;
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource?.destroy();
    await moduleRef?.close();
  });

  beforeEach(async () => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];

    await dataSource.query(
      'TRUNCATE TABLE "audit_log", "agent_idempotency_keys", "menu_items", "recipe_ingredients", "recipes", "supplier_items", "suppliers", "ingredients", "categories", "user_locations", "users", "locations", "organizations" RESTART IDENTITY CASCADE',
    );
    org = await organizations.save(
      Organization.create({
        name: 'Acme',
        currencyCode: 'EUR',
        defaultLocale: 'es',
        timezone: 'Europe/Madrid',
      }),
    );
    category = await categories.save(
      Category.create({
        organizationId: org.id,
        parentId: null,
        name: 'food',
        nameEs: 'Comida',
        nameEn: 'Food',
      }),
    );
    ingredient = await ingredients.save(
      Ingredient.create({
        organizationId: org.id,
        categoryId: category.id,
        name: 'Tomate',
        baseUnitType: 'WEIGHT',
      }),
    );
    userId = '11111111-1111-4111-8111-111111111111';
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = savedEnv[k];
      }
    }
  });

  function ownerHeaders(): Record<string, string> {
    return {
      'x-test-user-id': userId,
      'x-test-org-id': org.id,
      'x-test-user-role': 'OWNER',
    };
  }

  function agentHeaders(capability: string): Record<string, string> {
    return {
      ...ownerHeaders(),
      'x-via-agent': 'true',
      'x-agent-name': 'test-agent',
      'x-agent-capability': capability,
    };
  }

  function recipeBody(name: string): unknown {
    return {
      organizationId: org.id,
      name,
      description: 'desc',
      wasteFactor: 0.05,
      lines: [{ ingredientId: ingredient.id, quantity: 0.25, unitId: 'kg' }],
    };
  }

  async function countRecipes(): Promise<number> {
    const rows: Array<{ count: string }> = await dataSource.query(
      'SELECT COUNT(*)::text AS count FROM "recipes"',
    );
    return Number(rows[0]?.count ?? '0');
  }

  // ----------------------------------------------------------------
  // Group 1 — Idempotency-Key round-trip
  // ----------------------------------------------------------------

  describe('Idempotency-Key round-trip', () => {
    it('first call writes; second call with same key+body replays cached body without inserting a fresh row', async () => {
      process.env.NEXANDRO_AGENT_RECIPES_CREATE_ENABLED = 'true';
      const body = recipeBody('Bolognesa');
      const beforeCount = await countRecipes();

      const first = await sendRequest(baseUrl, 'POST', '/recipes', {
        headers: { ...agentHeaders('recipes.create'), 'idempotency-key': 'abc123' },
        body,
      });
      expect(first.status).toBe(201);
      const firstBody = first.body as { data: { id: string; name: string } };
      expect(firstBody.data.name).toBe('Bolognesa');
      const afterFirst = await countRecipes();
      expect(afterFirst).toBe(beforeCount + 1);

      const second = await sendRequest(baseUrl, 'POST', '/recipes', {
        headers: { ...agentHeaders('recipes.create'), 'idempotency-key': 'abc123' },
        body,
      });
      expect(second.status).toBe(201);
      const secondBody = second.body as { data: { id: string } };
      // Same id (replayed cached body), no new row.
      expect(secondBody.data.id).toBe(firstBody.data.id);
      expect(await countRecipes()).toBe(afterFirst);
    });

    it('second call with same key + DIFFERENT body returns 409 IDEMPOTENCY_KEY_REQUEST_MISMATCH', async () => {
      process.env.NEXANDRO_AGENT_RECIPES_CREATE_ENABLED = 'true';
      const first = await sendRequest(baseUrl, 'POST', '/recipes', {
        headers: { ...agentHeaders('recipes.create'), 'idempotency-key': 'abc123' },
        body: recipeBody('Bolognesa'),
      });
      expect(first.status).toBe(201);

      const second = await sendRequest(baseUrl, 'POST', '/recipes', {
        headers: { ...agentHeaders('recipes.create'), 'idempotency-key': 'abc123' },
        body: recipeBody('Carbonara'),
      });
      expect(second.status).toBe(409);
      expect((second.body as { code: string }).code).toBe(
        'IDEMPOTENCY_KEY_REQUEST_MISMATCH',
      );
    });

    it('third call with NO Idempotency-Key always inserts a fresh row', async () => {
      process.env.NEXANDRO_AGENT_RECIPES_CREATE_ENABLED = 'true';
      const first = await sendRequest(baseUrl, 'POST', '/recipes', {
        headers: { ...agentHeaders('recipes.create'), 'idempotency-key': 'abc123' },
        body: recipeBody('Bolognesa'),
      });
      expect(first.status).toBe(201);
      const beforeCount = await countRecipes();

      const fresh = await sendRequest(baseUrl, 'POST', '/recipes', {
        headers: agentHeaders('recipes.create'),
        body: recipeBody('Carbonara'),
      });
      expect(fresh.status).toBe(201);
      expect(await countRecipes()).toBe(beforeCount + 1);
      const freshBody = fresh.body as { data: { id: string } };
      const firstBody = first.body as { data: { id: string } };
      expect(freshBody.data.id).not.toBe(firstBody.data.id);
    });
  });

  // ----------------------------------------------------------------
  // Group 2 — BeforeAfterAuditInterceptor before/after capture
  // ----------------------------------------------------------------

  describe('BeforeAfterAuditInterceptor — agent-routed write traffic', () => {
    async function seedRecipe(name: string): Promise<{ id: string }> {
      const recipe = await dataSource.getRepository(Recipe).save(
        Recipe.create({
          organizationId: org.id,
          name,
          description: 'desc',
          wasteFactor: 0.05,
        }),
      );
      return { id: recipe.id };
    }

    async function richAgentRows(
      aggregateId?: string,
    ): Promise<
      Array<{
        event_type: string;
        actor_kind: string;
        agent_name: string | null;
        aggregate_type: string;
        aggregate_id: string;
        payload_before: unknown;
        payload_after: unknown;
      }>
    > {
      // Filter to rows the BeforeAfterAuditInterceptor emits — they carry
      // a domain aggregate_type (`recipe`, `menu_item`, ...) on the dedicated
      // AGENT_ACTION_FORENSIC channel (per ADR-026 m2-audit-log-forensic-split).
      const rows = await dataSource.query(
        `SELECT event_type, actor_kind, agent_name, aggregate_type, aggregate_id,
                payload_before, payload_after
         FROM "audit_log"
         WHERE event_type = 'AGENT_ACTION_FORENSIC'
           AND actor_kind = 'agent'
           ${aggregateId ? 'AND aggregate_id = $1' : ''}
         ORDER BY created_at DESC`,
        aggregateId ? [aggregateId] : [],
      );
      return rows;
    }

    it('PUT /recipes/:id with X-Via-Agent emits an AGENT_ACTION_FORENSIC row with payload_before + payload_after + agent_name + capability', async () => {
      process.env.NEXANDRO_AGENT_RECIPES_UPDATE_ENABLED = 'true';
      const seeded = await seedRecipe('Bolognesa');

      const res = await sendRequest(
        baseUrl,
        'PUT',
        `/recipes/${seeded.id}?organizationId=${org.id}`,
        {
          headers: agentHeaders('recipes.update'),
          body: { name: 'Bolognesa renamed' },
        },
      );
      expect(res.status).toBe(200);

      const rows = await richAgentRows(seeded.id);
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const row = rows[0];
      expect(row.event_type).toBe('AGENT_ACTION_FORENSIC');
      expect(row.actor_kind).toBe('agent');
      expect(row.agent_name).toBe('test-agent');
      expect(row.aggregate_type).toBe('recipe');
      expect(row.aggregate_id).toBe(seeded.id);

      // payload_before captures the original recipe shape.
      const before = row.payload_before as { name?: string } | null;
      expect(before).not.toBeNull();
      expect(before?.name).toBe('Bolognesa');

      // payload_after captures the updated shape (RecipeResponseDto.data).
      const after = row.payload_after as { name?: string } | null;
      expect(after).not.toBeNull();
      expect(after?.name).toBe('Bolognesa renamed');
    });

    it('direct REST PUT (no X-Via-Agent) does NOT emit on either agent channel', async () => {
      // Observed behaviour (Wave 1.5 + Wave 1.13 [3a] + this slice):
      //   - AgentAuditMiddleware only emits AGENT_ACTION_EXECUTED when X-Via-Agent
      //     truthy headers are present; direct REST is silent on the lean channel.
      //   - BeforeAfterAuditInterceptor short-circuits when viaAgent !== true,
      //     so no AGENT_ACTION_FORENSIC row either.
      // → audit_log carries 0 AGENT_ACTION_* rows for plain REST.
      const seeded = await seedRecipe('Bolognesa');
      const res = await sendRequest(
        baseUrl,
        'PUT',
        `/recipes/${seeded.id}?organizationId=${org.id}`,
        {
          headers: ownerHeaders(),
          body: { name: 'Renamed' },
        },
      );
      expect(res.status).toBe(200);

      const rows = await dataSource.query(
        `SELECT count(*)::text AS count FROM "audit_log"
           WHERE event_type IN ('AGENT_ACTION_EXECUTED', 'AGENT_ACTION_FORENSIC')`,
      );
      expect(Number(rows[0]?.count ?? '0')).toBe(0);
    });

    it('DELETE /recipes/:id via agent headers carries payload_before populated and payload_after null', async () => {
      process.env.NEXANDRO_AGENT_RECIPES_DELETE_ENABLED = 'true';
      const seeded = await seedRecipe('Bolognesa');

      const res = await sendRequest(
        baseUrl,
        'DELETE',
        `/recipes/${seeded.id}?organizationId=${org.id}`,
        { headers: agentHeaders('recipes.delete') },
      );
      expect(res.status).toBe(200);

      const rows = await richAgentRows(seeded.id);
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const row = rows[0];
      expect(row.aggregate_type).toBe('recipe');
      const before = row.payload_before as { name?: string } | null;
      expect(before?.name).toBe('Bolognesa');
      // The soft-delete handler returns `WriteResponseDto<{id}>`; the
      // unwrap leaves `{id}` only — no name field, but the row IS not
      // null (the unwrap is best-effort, only `null` for void responses).
      expect(row.payload_after).not.toBeNull();
    });

    it('POST /recipes via agent headers (create) carries payload_before null and payload_after populated', async () => {
      process.env.NEXANDRO_AGENT_RECIPES_CREATE_ENABLED = 'true';
      const res = await sendRequest(baseUrl, 'POST', '/recipes', {
        headers: agentHeaders('recipes.create'),
        body: recipeBody('Carbonara'),
      });
      expect(res.status).toBe(201);
      const created = (res.body as { data: { id: string; name: string } }).data;

      const rows = await richAgentRows(created.id);
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const row = rows[0];
      expect(row.aggregate_type).toBe('recipe');
      expect(row.payload_before).toBeNull();
      const after = row.payload_after as { name?: string } | null;
      expect(after?.name).toBe('Carbonara');
    });
  });

  // ----------------------------------------------------------------
  // Group 3 — AgentCapabilityGuard 503 rejection
  // ----------------------------------------------------------------

  describe('AgentCapabilityGuard — per-capability kill-switch', () => {
    async function seedRecipe(): Promise<{ id: string }> {
      const recipe = await dataSource.getRepository(Recipe).save(
        Recipe.create({
          organizationId: org.id,
          name: 'Bolognesa',
          description: 'desc',
          wasteFactor: 0.05,
        }),
      );
      return { id: recipe.id };
    }

    it('flag=false (default) + agent headers → 503 AGENT_CAPABILITY_DISABLED', async () => {
      const seeded = await seedRecipe();
      // Explicitly clear / set false.
      delete process.env.NEXANDRO_AGENT_RECIPES_UPDATE_ENABLED;
      const res = await sendRequest(
        baseUrl,
        'PUT',
        `/recipes/${seeded.id}?organizationId=${org.id}`,
        {
          headers: agentHeaders('recipes.update'),
          body: { name: 'Renamed' },
        },
      );
      expect(res.status).toBe(503);
      const body = res.body as { code: string; capability: string; message: string };
      expect(body.code).toBe('AGENT_CAPABILITY_DISABLED');
      expect(body.capability).toBe('recipes.update');
      expect(body.message).toContain(
        'NEXANDRO_AGENT_RECIPES_UPDATE_ENABLED',
      );
    });

    it('flag=true + agent headers → request succeeds', async () => {
      process.env.NEXANDRO_AGENT_RECIPES_UPDATE_ENABLED = 'true';
      const seeded = await seedRecipe();
      const res = await sendRequest(
        baseUrl,
        'PUT',
        `/recipes/${seeded.id}?organizationId=${org.id}`,
        {
          headers: agentHeaders('recipes.update'),
          body: { name: 'Renamed' },
        },
      );
      expect(res.status).toBe(200);
    });

    it('direct REST (no X-Via-Agent) succeeds REGARDLESS of the flag value', async () => {
      // Flag is unset (default false).
      delete process.env.NEXANDRO_AGENT_RECIPES_UPDATE_ENABLED;
      const seeded = await seedRecipe();
      const res = await sendRequest(
        baseUrl,
        'PUT',
        `/recipes/${seeded.id}?organizationId=${org.id}`,
        {
          headers: ownerHeaders(),
          body: { name: 'Renamed via UI' },
        },
      );
      expect(res.status).toBe(200);
    });
  });
});
