import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Organization } from '../domain/organization.entity';
import { User } from '../domain/user.entity';
import { Location } from '../domain/location.entity';
import { UserLocation } from '../domain/user-location.entity';
import { OrganizationRepository } from './organization.repository';

describe('OrganizationRepository (integration)', () => {
  let app: TestingModule;
  let dataSource: DataSource;
  let repo: OrganizationRepository;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: process.env.DATABASE_URL ?? 'postgres://nexandro_test:nexandro_test@localhost:5433/nexandro_test',
          entities: [Organization, User, Location, UserLocation],
          migrations: [`${__dirname}/../../migrations/*.{ts,js}`],
          migrationsTableName: 'nexandro_migrations',
          synchronize: false,
        }),
        TypeOrmModule.forFeature([Organization, User, Location, UserLocation]),
      ],
      providers: [OrganizationRepository],
    }).compile();

    dataSource = app.get(DataSource);
    repo = app.get(OrganizationRepository);
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await app?.close();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE "user_locations", "users", "locations", "organizations" RESTART IDENTITY CASCADE');
  });

  it('persists an Organization end-to-end', async () => {
    const org = Organization.create({
      name: 'Acme S.L.',
      currencyCode: 'EUR',
      defaultLocale: 'es',
      timezone: 'Europe/Madrid',
    });
    const saved = await repo.save(org);
    expect(saved.id).toBe(org.id);

    const loaded = await repo.findByIdOrThrow(org.id);
    expect(loaded.name).toBe('Acme S.L.');
    expect(loaded.currencyCode).toBe('EUR');
    expect(loaded.defaultLocale).toBe('es');
    expect(loaded.timezone).toBe('Europe/Madrid');
  });

  it('rejects an INSERT with an invalid currency at the DB CHECK level', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO "organizations" ("id", "name", "currency_code", "default_locale", "timezone")
         VALUES ($1, 'Bad', 'eur', 'es', 'Europe/Madrid')`,
        ['11111111-1111-4111-8111-111111111111'],
      ),
    ).rejects.toThrow(/ck_organizations_currency_iso4217|check constraint/i);
  });

  describe('updateMutable strips currencyCode (D6)', () => {
    it('does not change currencyCode when patch contains it', async () => {
      const org = await repo.save(
        Organization.create({
          name: 'Acme',
          currencyCode: 'EUR',
          defaultLocale: 'es',
          timezone: 'Europe/Madrid',
        }),
      );

      const updated = await repo.updateMutable(org.id, {
        name: 'Acme Renamed',
        currencyCode: 'USD' as never,
      });

      expect(updated.name).toBe('Acme Renamed');
      expect(updated.currencyCode).toBe('EUR');

      const reloaded = await repo.findByIdOrThrow(org.id);
      expect(reloaded.currencyCode).toBe('EUR');
    });
  });
});
