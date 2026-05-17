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
import { AgentIdempotencyKey } from '../shared/domain/agent-idempotency-key.entity';
import { AgentCapabilityGuard } from '../shared/guards/agent-capability.guard';
import { RolesGuard } from '../shared/guards/roles.guard';
import { BeforeAfterAuditInterceptor } from '../shared/interceptors/before-after-audit.interceptor';
import { AgentAuditMiddleware } from '../shared/middleware/agent-audit.middleware';
import { IdempotencyMiddleware } from '../shared/middleware/idempotency.middleware';
import { SharedModule } from '../shared/shared.module';
import { AgentChatModule } from './agent-chat.module';

const ALL_ENTITIES = [
  Organization,
  User,
  Location,
  UserLocation,
  AuditLog,
  AgentIdempotencyKey,
];

/**
 * Test-only middleware: synthesise `req.user` from `X-Test-*` headers, mirroring
 * the pattern used by `agent-write-capabilities.int.spec.ts`.
 */
@Injectable()
class TestAuthMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const userId = req.headers['x-test-user-id'];
    const orgId = req.headers['x-test-org-id'];
    const role = req.headers['x-test-user-role'];
    if (
      typeof userId === 'string' &&
      typeof orgId === 'string' &&
      typeof role === 'string'
    ) {
      (req as Request & { user?: { userId: string; organizationId: string; role: UserRole } }).user = {
        userId,
        organizationId: orgId,
        role: role as UserRole,
      };
    }
    next();
  }
}

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
    SharedModule,
    AuditLogModule,
    AgentChatModule,
  ],
  providers: [
    OrganizationRepository,
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: AgentCapabilityGuard },
    { provide: APP_INTERCEPTOR, useClass: BeforeAfterAuditInterceptor },
  ],
})
class TestAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TestAuthMiddleware, AgentAuditMiddleware, IdempotencyMiddleware).forRoutes('*');
  }
}

interface HttpResp {
  status: number;
  body: string;
  contentType: string;
}

async function postJson(
  baseUrl: string,
  path: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<HttpResp> {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        method: 'POST',
        path: url.pathname + url.search,
        headers: {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(payload)),
          accept: 'text/event-stream',
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            contentType: String(res.headers['content-type'] ?? ''),
          }),
        );
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Lightweight stand-in for the Hermes `web_via_http_sse` platform. Listens
 * on a local port and returns a fixed SSE script. Lets the spec assert the
 * apps/api relay forwards bank_id + auth header + body shape correctly.
 */
function startFakeHermes(): Promise<{ url: string; close: () => Promise<void>; received: { auth: string; bodies: unknown[] } }> {
  return new Promise((resolve) => {
    const received = { auth: '', bodies: [] as unknown[] };
    const server = http.createServer((req, res) => {
      received.auth = String(req.headers['x-web-auth-secret'] ?? '');
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        try {
          received.bodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          received.bodies.push(null);
        }
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        res.write('event: token\ndata: {"chunk":"Hola "}\n\n');
        res.write('event: token\ndata: {"chunk":"Lourdes"}\n\n');
        res.write('event: done\ndata: {"finishReason":"stop"}\n\n');
        res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => server.close(() => r())),
        received,
      });
    });
  });
}

describe('agent-chat — flag-enabled (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let server: http.Server;
  let baseUrl: string;
  let fakeHermes: Awaited<ReturnType<typeof startFakeHermes>>;
  let organizations: OrganizationRepository;
  let org: Organization;
  const userId = '11111111-1111-4111-8111-111111111111';

  beforeAll(async () => {
    fakeHermes = await startFakeHermes();
    process.env.NEXANDRO_AGENT_ENABLED = 'true';
    process.env.NEXANDRO_HERMES_BASE_URL = fakeHermes.url;
    process.env.NEXANDRO_HERMES_AUTH_SECRET = 's3cret-int';

    moduleRef = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);
    organizations = moduleRef.get(OrganizationRepository);
    await dataSource.runMigrations();
    server = app.getHttpServer() as http.Server;
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource?.destroy();
    await moduleRef?.close();
    await fakeHermes.close();
    delete process.env.NEXANDRO_AGENT_ENABLED;
    delete process.env.NEXANDRO_HERMES_BASE_URL;
    delete process.env.NEXANDRO_HERMES_AUTH_SECRET;
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "audit_log", "agent_idempotency_keys", "user_locations", "users", "locations", "organizations" RESTART IDENTITY CASCADE',
    );
    org = await organizations.save(
      Organization.create({
        name: 'Acme Trattoria',
        currencyCode: 'EUR',
        defaultLocale: 'es',
        timezone: 'Europe/Madrid',
      }),
    );
    fakeHermes.received.auth = '';
    fakeHermes.received.bodies = [];
  });

  it('relays SSE events 1:1 from Hermes and writes one audit row', async () => {
    const res = await postJson(
      baseUrl,
      '/agent-chat/stream',
      { message: { type: 'text', content: 'hi' }, sessionId: 'sess-1' },
      {
        'x-test-user-id': userId,
        'x-test-org-id': org.id,
        'x-test-user-role': 'OWNER',
      },
    );
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('text/event-stream');
    expect(res.body).toContain('event: token');
    // Each chunk arrives in its own SSE frame, so the assertion checks the
    // tokens individually rather than asserting a concatenated string.
    expect(res.body).toContain('"chunk":"Hola "');
    expect(res.body).toContain('"chunk":"Lourdes"');
    expect(res.body).toContain('event: done');

    // Assert relay forwarded auth + bank_id correctly to fake Hermes.
    expect(fakeHermes.received.auth).toBe('s3cret-int');
    expect(fakeHermes.received.bodies).toHaveLength(1);
    const sent = fakeHermes.received.bodies[0] as { bank_id: string; user_attribution: { user_id: string }; message: unknown };
    expect(sent.bank_id).toBe('nexandro-acme-trattoria');
    expect(sent.user_attribution.user_id).toBe(userId);

    // Assert exactly one AGENT_ACTION_FORENSIC audit row was written (per
    // ADR-026 m2-audit-log-forensic-split), scoped to chat_session aggregate,
    // agent_name=hermes-web. The aggregate_id is a fresh UUID per turn (chat
    // sessionIds are free-form strings; the aggregate_id column is
    // UUID-typed; per ADR-027 streaming pattern). The chat sessionId itself is
    // carried in `payload_after.sessionId` for forensic linkage.
    const rows = await dataSource.query(
      `SELECT event_type, agent_name, aggregate_type, aggregate_id, actor_kind, payload_after
         FROM "audit_log"
         WHERE event_type = 'AGENT_ACTION_FORENSIC'
           AND agent_name = 'hermes-web'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].aggregate_type).toBe('chat_session');
    expect(rows[0].actor_kind).toBe('agent');
    expect(rows[0].aggregate_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rows[0].payload_after.sessionId).toBe('sess-1');
  });

  it('repeated turn with same Idempotency-Key replays cached SSE without recalling Hermes', async () => {
    // Wave 1.13 [3c]: the extended IdempotencyMiddleware now wraps
    // text/event-stream responses, captures `event: token` + `event: done`
    // frames into the {kind:'sse-replay', text, finishReason} envelope, and
    // emits a synthetic stream on retry without invoking Hermes again.
    const headers = {
      'x-test-user-id': userId,
      'x-test-org-id': org.id,
      'x-test-user-role': 'OWNER',
      'idempotency-key': 'chat-key-1',
    };
    const body = { message: { type: 'text', content: 'hi' }, sessionId: 'sess-2' };

    const first = await postJson(baseUrl, '/agent-chat/stream', body, headers);
    expect(first.status).toBe(200);
    expect(fakeHermes.received.bodies).toHaveLength(1);

    const second = await postJson(baseUrl, '/agent-chat/stream', body, headers);
    expect(second.status).toBe(200);
    // Replay path: Hermes call count stays at 1.
    expect(fakeHermes.received.bodies).toHaveLength(1);
    // Replayed body: full text in one frame + done with replayed=true.
    expect(second.body).toContain('event: token');
    expect(second.body).toContain('"chunk":"Hola Lourdes"');
    expect(second.body).toContain('event: done');
    expect(second.body).toContain('"replayed":true');
  });

  it('Idempotency-Key with mismatched body returns HTTP 409', async () => {
    const headers = {
      'x-test-user-id': userId,
      'x-test-org-id': org.id,
      'x-test-user-role': 'OWNER',
      'idempotency-key': 'chat-key-mismatch',
    };

    const first = await postJson(
      baseUrl,
      '/agent-chat/stream',
      { message: { type: 'text', content: 'hi' }, sessionId: 'sess-3' },
      headers,
    );
    expect(first.status).toBe(200);

    const second = await postJson(
      baseUrl,
      '/agent-chat/stream',
      { message: { type: 'text', content: 'DIFFERENT' }, sessionId: 'sess-3' },
      headers,
    );
    expect(second.status).toBe(409);
    expect(second.body).toContain('IDEMPOTENCY_KEY_REQUEST_MISMATCH');
  });
});

describe('agent-chat — flag-disabled (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let server: http.Server;
  let baseUrl: string;
  let organizations: OrganizationRepository;
  let org: Organization;
  const userId = '22222222-2222-4222-8222-222222222222';

  beforeAll(async () => {
    process.env.NEXANDRO_AGENT_ENABLED = 'false';
    delete process.env.NEXANDRO_HERMES_BASE_URL;
    delete process.env.NEXANDRO_HERMES_AUTH_SECRET;

    moduleRef = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);
    organizations = moduleRef.get(OrganizationRepository);
    await dataSource.runMigrations();
    server = app.getHttpServer() as http.Server;
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource?.destroy();
    await moduleRef?.close();
    delete process.env.NEXANDRO_AGENT_ENABLED;
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "audit_log", "agent_idempotency_keys", "user_locations", "users", "locations", "organizations" RESTART IDENTITY CASCADE',
    );
    org = await organizations.save(
      Organization.create({
        name: 'Acme',
        currencyCode: 'EUR',
        defaultLocale: 'es',
        timezone: 'Europe/Madrid',
      }),
    );
  });

  it('returns 404 and writes zero audit rows when the flag is off', async () => {
    const res = await postJson(
      baseUrl,
      '/agent-chat/stream',
      { message: { type: 'text', content: 'hi' } },
      {
        'x-test-user-id': userId,
        'x-test-org-id': org.id,
        'x-test-user-role': 'OWNER',
      },
    );
    expect(res.status).toBe(404);
    const rows = await dataSource.query(
      `SELECT count(*)::text AS count
         FROM "audit_log"
         WHERE event_type = 'AGENT_ACTION_FORENSIC'
           AND agent_name = 'hermes-web'`,
    );
    expect(Number(rows[0]?.count ?? '0')).toBe(0);
  });
});
