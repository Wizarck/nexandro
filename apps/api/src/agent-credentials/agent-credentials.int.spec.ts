import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import { generateKeyPairSync } from 'node:crypto';
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
import { AgentCredential } from './domain/agent-credential.entity';
import { AgentCredentialsModule } from './agent-credentials.module';

const ALL_ENTITIES = [
  Organization,
  User,
  Location,
  UserLocation,
  AuditLog,
  AgentIdempotencyKey,
  AgentCredential,
];

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
    AgentCredentialsModule,
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
  json: () => unknown;
}

async function request(
  baseUrl: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<HttpResp> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const url = new URL(path, baseUrl);
    const allHeaders: Record<string, string> = { ...headers };
    if (payload !== undefined) {
      allHeaders['content-type'] = 'application/json';
      allHeaders['content-length'] = String(Buffer.byteLength(payload));
    }
    const req = http.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        method,
        path: url.pathname + url.search,
        headers: allHeaders,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: res.statusCode ?? 0,
            body: text,
            json: () => (text ? JSON.parse(text) : null),
          });
        });
      },
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

function generateSamplePublicKey(): string {
  const { publicKey } = generateKeyPairSync('ed25519');
  return publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}

describe('agent_credentials (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let server: http.Server;
  let baseUrl: string;
  let organizations: OrganizationRepository;
  let org: Organization;
  let otherOrg: Organization;
  const ownerHeaders = {
    'x-test-user-id': '99999999-9999-4999-8999-999999999999',
    'x-test-user-role': 'OWNER' as const,
  };
  const managerHeaders = {
    'x-test-user-id': '99999999-9999-4999-8999-999999999999',
    'x-test-user-role': 'MANAGER' as const,
  };

  beforeAll(async () => {
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
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "agent_credentials", "audit_log", "agent_idempotency_keys", "user_locations", "users", "locations", "organizations" RESTART IDENTITY CASCADE',
    );
    org = await organizations.save(
      Organization.create({
        name: 'Acme',
        currencyCode: 'EUR',
        defaultLocale: 'es',
        timezone: 'Europe/Madrid',
      }),
    );
    otherOrg = await organizations.save(
      Organization.create({
        name: 'OtherOrg',
        currencyCode: 'EUR',
        defaultLocale: 'es',
        timezone: 'Europe/Madrid',
      }),
    );
  });

  it('full CRUD round-trip + per-org isolation', async () => {
    const pubkey = generateSamplePublicKey();
    const headers = { ...ownerHeaders, 'x-test-org-id': org.id };

    // Create
    const created = await request(baseUrl, 'POST', '/agent-credentials', headers, {
      agentName: 'hermes',
      publicKey: pubkey,
      role: 'OWNER',
    });
    expect(created.status).toBe(201);
    const createdJson = created.json() as { data: { id: string; agentName: string } };
    expect(createdJson.data.agentName).toBe('hermes');
    expect(created.body).not.toContain(pubkey); // public_key never echoed

    const credId = createdJson.data.id;

    // List (own org sees the row)
    const listOwn = await request(baseUrl, 'GET', '/agent-credentials', headers);
    expect(listOwn.status).toBe(200);
    expect((listOwn.json() as unknown[]).length).toBe(1);

    // List (other org sees nothing — per-org isolation)
    const otherHeaders = { ...ownerHeaders, 'x-test-org-id': otherOrg.id };
    const listOther = await request(baseUrl, 'GET', '/agent-credentials', otherHeaders);
    expect(listOther.status).toBe(200);
    expect((listOther.json() as unknown[]).length).toBe(0);

    // Revoke
    const revoked = await request(baseUrl, 'PUT', `/agent-credentials/${credId}/revoke`, headers);
    expect(revoked.status).toBe(200);
    const revokedJson = revoked.json() as { data: { revokedAt: string | null } };
    expect(revokedJson.data.revokedAt).not.toBeNull();

    // Delete
    const deleted = await request(baseUrl, 'DELETE', `/agent-credentials/${credId}`, headers);
    expect(deleted.status).toBe(200);
    const after = await request(baseUrl, 'GET', '/agent-credentials', headers);
    expect((after.json() as unknown[]).length).toBe(0);
  });

  it('rejects duplicate agentName per-org with HTTP 409', async () => {
    const pubkey = generateSamplePublicKey();
    const headers = { ...ownerHeaders, 'x-test-org-id': org.id };
    const create = (): Promise<HttpResp> =>
      request(baseUrl, 'POST', '/agent-credentials', headers, {
        agentName: 'hermes',
        publicKey: pubkey,
        role: 'OWNER',
      });

    const first = await create();
    expect(first.status).toBe(201);

    const second = await create();
    expect(second.status).toBe(409);
    expect(second.body).toContain('AGENT_NAME_TAKEN');
  });

  it('forbids non-Owner roles with HTTP 403', async () => {
    const pubkey = generateSamplePublicKey();
    const headers = { ...managerHeaders, 'x-test-org-id': org.id };
    const res = await request(baseUrl, 'POST', '/agent-credentials', headers, {
      agentName: 'hermes',
      publicKey: pubkey,
      role: 'OWNER',
    });
    expect(res.status).toBe(403);
  });

  it('rotation: POST /:id/rotate swaps publicKey atomically (Wave 1.17)', async () => {
    const pubkey1 = generateSamplePublicKey();
    const pubkey2 = generateSamplePublicKey();
    expect(pubkey1).not.toBe(pubkey2);
    const headers = { ...ownerHeaders, 'x-test-org-id': org.id };

    // Register
    const created = await request(baseUrl, 'POST', '/agent-credentials', headers, {
      agentName: 'hermes-rot',
      publicKey: pubkey1,
      role: 'OWNER',
    });
    expect(created.status).toBe(201);
    const credId = (created.json() as { data: { id: string } }).data.id;

    // Rotate
    const rotated = await request(baseUrl, 'POST', `/agent-credentials/${credId}/rotate`, headers, {
      publicKey: pubkey2,
    });
    expect(rotated.status).toBe(200);
    const data = (rotated.json() as { data: { id: string; agentName: string; revokedAt: string | null } }).data;
    expect(data.id).toBe(credId);
    expect(data.agentName).toBe('hermes-rot');
    expect(data.revokedAt).toBeNull();
    // Response does NOT echo publicKey
    expect(rotated.body).not.toContain(pubkey2);

    // Direct DB read to confirm the swap landed
    const dbRow = await dataSource.query(
      'SELECT public_key FROM agent_credentials WHERE id = $1',
      [credId],
    );
    expect(dbRow[0].public_key).toBe(pubkey2);
  });

  it('rotation: rejects rotation against a revoked credential with HTTP 409', async () => {
    const pubkey1 = generateSamplePublicKey();
    const pubkey2 = generateSamplePublicKey();
    const headers = { ...ownerHeaders, 'x-test-org-id': org.id };

    const created = await request(baseUrl, 'POST', '/agent-credentials', headers, {
      agentName: 'hermes-rev',
      publicKey: pubkey1,
      role: 'OWNER',
    });
    const credId = (created.json() as { data: { id: string } }).data.id;

    // Revoke
    const revoked = await request(baseUrl, 'PUT', `/agent-credentials/${credId}/revoke`, headers);
    expect(revoked.status).toBe(200);

    // Attempt rotation
    const rotated = await request(baseUrl, 'POST', `/agent-credentials/${credId}/rotate`, headers, {
      publicKey: pubkey2,
    });
    expect(rotated.status).toBe(409);
    expect(rotated.body).toContain('AGENT_CREDENTIAL_REVOKED');

    // DB row's public_key should be unchanged (still pubkey1)
    const dbRow = await dataSource.query(
      'SELECT public_key FROM agent_credentials WHERE id = $1',
      [credId],
    );
    expect(dbRow[0].public_key).toBe(pubkey1);
  });
});
