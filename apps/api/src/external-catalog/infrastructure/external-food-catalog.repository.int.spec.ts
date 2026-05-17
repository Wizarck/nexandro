import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { Organization } from '../../iam/domain/organization.entity';
import { User } from '../../iam/domain/user.entity';
import { Location } from '../../iam/domain/location.entity';
import { UserLocation } from '../../iam/domain/user-location.entity';
import { ExternalFoodCatalog } from '../domain/external-food-catalog.entity';
import { OFF_LICENSE_ATTRIBUTION } from '../application/off-product-mapper';
import { ExternalFoodCatalogRepository } from './external-food-catalog.repository';

const ALL_ENTITIES = [Organization, User, Location, UserLocation, ExternalFoodCatalog];

/**
 * INT spec — deferred-run-pending-docker. Mirrors the M1 pattern: requires a
 * running Postgres test container reachable at $DATABASE_URL (default port
 * 5433). When docker-compose.test.yml is up, run with `npm run test:int`.
 */
describe('ExternalFoodCatalogRepository (integration)', () => {
  let app: TestingModule;
  let dataSource: DataSource;
  let repo: ExternalFoodCatalogRepository;

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
      providers: [ExternalFoodCatalogRepository],
    }).compile();

    dataSource = app.get(DataSource);
    repo = app.get(ExternalFoodCatalogRepository);
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await app?.close();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE "external_food_catalog" RESTART IDENTITY CASCADE');
  });

  const buildRow = (overrides: Partial<Parameters<typeof ExternalFoodCatalog.create>[0]> = {}) =>
    ExternalFoodCatalog.create({
      barcode: '8410173005111',
      name: 'Aceite de oliva virgen extra',
      brand: 'Carbonell',
      nutrition: { 'energy-kcal_100g': 884 },
      allergens: ['gluten'],
      dietFlags: ['vegan'],
      region: 'ES',
      lastModifiedAt: new Date('2025-12-01T00:00:00Z'),
      licenseAttribution: OFF_LICENSE_ATTRIBUTION,
      ...overrides,
    });

  it('round-trip: save + findByBarcode preserves all fields including arrays + jsonb', async () => {
    const row = buildRow();
    await repo.save(row);

    const found = await repo.findByBarcode('8410173005111');
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Aceite de oliva virgen extra');
    expect(found?.brand).toBe('Carbonell');
    expect(found?.allergens).toEqual(['gluten']);
    expect(found?.dietFlags).toEqual(['vegan']);
    expect(found?.region).toBe('ES');
    expect(found?.licenseAttribution).toBe(OFF_LICENSE_ATTRIBUTION);
    expect(found?.nutrition).toEqual({ 'energy-kcal_100g': 884 });
  });

  it('UNIQUE constraint on barcode rejects duplicates', async () => {
    await repo.save(buildRow({ barcode: '111' }));
    await expect(
      repo.save(buildRow({ barcode: '111', name: 'Different product' })),
    ).rejects.toBeInstanceOf(QueryFailedError);
  });

  it('region scoping: searchByName filters by region', async () => {
    await repo.save(buildRow({ barcode: '1', name: 'Tomate frito', region: 'ES' }));
    await repo.save(buildRow({ barcode: '2', name: 'Tomate pelato', region: 'IT' }));

    const es = await repo.searchByName('Tomate', 'ES');
    const it = await repo.searchByName('Tomate', 'IT');

    expect(es).toHaveLength(1);
    expect(es[0].region).toBe('ES');
    expect(it).toHaveLength(1);
    expect(it[0].region).toBe('IT');
  });

  it('searchByBrand region-scoped exact + prefix', async () => {
    await repo.save(buildRow({ barcode: '1', brand: 'Carbonell', region: 'ES' }));
    await repo.save(buildRow({ barcode: '2', brand: 'CarbonellPro', region: 'ES' }));
    await repo.save(buildRow({ barcode: '3', brand: 'Carbonell', region: 'IT' }));

    const es = await repo.searchByBrand('Carbonell', 'ES');
    expect(es.map((r) => r.barcode).sort()).toEqual(['1', '2']);
  });

  it('getSyncCursor returns max last_modified_at per region', async () => {
    await repo.save(
      buildRow({ barcode: '1', region: 'ES', lastModifiedAt: new Date('2025-01-01') }),
    );
    await repo.save(
      buildRow({ barcode: '2', region: 'ES', lastModifiedAt: new Date('2025-12-01') }),
    );
    await repo.save(
      buildRow({ barcode: '3', region: 'IT', lastModifiedAt: new Date('2026-01-01') }),
    );

    const esCursor = await repo.getSyncCursor('ES');
    const itCursor = await repo.getSyncCursor('IT');
    const frCursor = await repo.getSyncCursor('FR');

    expect(esCursor?.toISOString()).toBe(new Date('2025-12-01').toISOString());
    expect(itCursor?.toISOString()).toBe(new Date('2026-01-01').toISOString());
    expect(frCursor).toBeNull();
  });

  it('getStats returns rowCount + most recent syncedAt', async () => {
    await repo.save(buildRow({ barcode: '1' }));
    await repo.save(buildRow({ barcode: '2' }));

    const stats = await repo.getStats();
    expect(stats.rowCount).toBe(2);
    expect(stats.lastSyncAt).toBeInstanceOf(Date);
  });

  it('CHECK constraint rejects blank barcode at the database level', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO "external_food_catalog" (id, barcode, name, region, license_attribution)
         VALUES ($1, '', 'X', 'ES', 'ODbL')`,
        ['44444444-4444-4444-8444-444444444444'],
      ),
    ).rejects.toThrow(/ck_external_food_catalog_barcode_nonblank|check constraint/i);
  });
});
