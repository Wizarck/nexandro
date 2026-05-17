import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import { generateKeyPairSync, sign } from 'node:crypto';
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

import { AgentCredentialsModule } from '../agent-credentials/agent-credentials.module';
import { AgentCredential } from '../agent-credentials/domain/agent-credential.entity';
import { AgentCredentialRepository } from '../agent-credentials/infrastructure/agent-credential.repository';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuditLog } from '../audit-log/domain/audit-log.entity';
import { Organization } from '../iam/domain/organization.entity';
import { User, UserRole } from '../iam/domain/user.entity';
import { Location } from '../iam/domain/location.entity';
import { UserLocation } from '../iam/domain/user-location.entity';
import { OrganizationRepository } from '../iam/infrastructure/organization.repository';
import { AgentIdempotencyKey } from './domain/agent-idempotency-key.entity';
import { AgentCapabilityGuard } from './guards/agent-capability.guard';
import { RolesGuard } from './guards/roles.guard';
import { BeforeAfterAuditInterceptor } from './interceptors/before-after-audit.interceptor';
import { AgentAuditMiddleware } from './middleware/agent-audit.middleware';
import { AgentSignatureMiddleware } from './middleware/agent-signature.middleware';
import { IdempotencyMiddleware } from './middleware/idempotency.middleware';
import { SharedModule } from './shared.module';
import { buildEnvelope } from './middleware/agent-signature.middleware';

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
    consumer
      .apply(TestAuthMiddleware, AgentSignatureMiddleware, AgentAuditMiddleware, IdempotencyMiddleware)
      .forRoutes('*');
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

function generateAgentKeypair(): {
  publicKeyB64: string;
  privateKey: import('node:crypto').KeyObject;
} {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyB64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKey,
  };
}

function signAgentRequest(
  privateKey: import('node:crypto').KeyObject,
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body: unknown,
): { headers: Record<string, string>; ts: string; nonce: string } {
  const ts = new Date().toISOString();
  const nonce = `nonce-${Math.random().toString(36).slice(2)}`;
  const env = buildEnvelope(method, path, ts, nonce, body);
  const sig = sign(null, env, privateKey).toString('base64');
  return {
    headers: {
      'x-agent-signature': sig,
      'x-agent-timestamp': ts,
      'x-agent-nonce': nonce,
    },
    ts,
    nonce,
  };
}

describe('AgentSignatureMiddleware (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let server: http.Server;
  let baseUrl: string;
  let credRepo: AgentCredentialRepository;
  let organizations: OrganizationRepository;
  let org: Organization;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);
    credRepo = moduleRef.get(AgentCredentialRepository);
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
    delete process.env.NEXANDRO_AGENT_SIGNATURE_REQUIRED;
  });

  beforeEach(async () => {
    delete process.env.NEXANDRO_AGENT_SIGNATURE_REQUIRED;
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
  });

  it('signed POST → reaches handler with verified context (signature present, flag off)', async () => {
    const { publicKeyB64, privateKey } = generateAgentKeypair();
    const ownerHeaders = {
      'x-test-user-id': '99999999-9999-4999-8999-999999999999',
      'x-test-user-role': 'OWNER' as const,
      'x-test-org-id': org.id,
    };

    // 1. Owner registers an agent credential.
    const created = await request(baseUrl, 'POST', '/agent-credentials', ownerHeaders, {
      agentName: 'hermes',
      publicKey: publicKeyB64,
      role: 'OWNER',
    });
    expect(created.status).toBe(201);
    const credId = (created.json() as { data: { id: string } }).data.id;

    // 2. Now agent makes a signed POST.
    const body = { agentName: 'second-cred', publicKey: publicKeyB64, role: 'STAFF' };
    const { headers: sigHeaders } = signAgentRequest(privateKey, 'POST', '/agent-credentials', body);
    const signedRes = await request(baseUrl, 'POST', '/agent-credentials', {
      ...ownerHeaders,
      'x-agent-id': credId,
      ...sigHeaders,
    }, body);
    expect(signedRes.status).toBe(201);
  });

  it('flag-on + viaAgent without signature → 401', async () => {
    process.env.NEXANDRO_AGENT_SIGNATURE_REQUIRED = org.id;
    const ownerHeaders = {
      'x-test-user-id': '99999999-9999-4999-8999-999999999999',
      'x-test-user-role': 'OWNER' as const,
      'x-test-org-id': org.id,
      'x-via-agent': 'true',
    };
    const res = await request(baseUrl, 'POST', '/agent-credentials', ownerHeaders, {
      agentName: 'wantsToCreate',
      publicKey: 'fake',
      role: 'STAFF',
    });
    expect(res.status).toBe(401);
    expect(res.body).toContain('AGENT_SIGNATURE_REQUIRED');
  });

  it('tampered body fails verification with 401', async () => {
    const { publicKeyB64, privateKey } = generateAgentKeypair();
    // First register the credential bypass-flag via direct repo write.
    const cred = AgentCredential.create({
      organizationId: org.id,
      agentName: 'hermes',
      publicKey: publicKeyB64,
      role: 'OWNER',
    });
    await credRepo.save(cred);

    const goodBody = { agentName: 'good', publicKey: publicKeyB64, role: 'STAFF' };
    const { headers } = signAgentRequest(privateKey, 'POST', '/agent-credentials', goodBody);
    const tamperedBody = { agentName: 'evil', publicKey: publicKeyB64, role: 'OWNER' };

    const res = await request(baseUrl, 'POST', '/agent-credentials', {
      'x-test-user-id': '99999999-9999-4999-8999-999999999999',
      'x-test-user-role': 'OWNER',
      'x-test-org-id': org.id,
      'x-agent-id': cred.id,
      ...headers,
    }, tamperedBody);
    expect(res.status).toBe(401);
    expect(res.body).toContain('AGENT_SIGNATURE_INVALID');
  });
});
