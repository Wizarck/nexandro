import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Readable } from 'node:stream';
import { DataSource } from 'typeorm';
import { Organization } from '../../iam/domain/organization.entity';
import { User } from '../../iam/domain/user.entity';
import { Location } from '../../iam/domain/location.entity';
import { UserLocation } from '../../iam/domain/user-location.entity';
import { OrganizationRepository } from '../../iam/infrastructure/organization.repository';
import { Category } from '../domain/category.entity';
import { Ingredient } from '../domain/ingredient.entity';
import { CategoryRepository } from '../infrastructure/category.repository';
import { IngredientRepository } from '../infrastructure/ingredient.repository';
import { IngredientImportService } from './ingredient-import.service';

const ALL_ENTITIES = [Organization, User, Location, UserLocation, Category, Ingredient];

describe('IngredientImportService (integration)', () => {
  let app: TestingModule;
  let dataSource: DataSource;
  let importService: IngredientImportService;
  let categories: CategoryRepository;
  let ingredients: IngredientRepository;
  let organizations: OrganizationRepository;

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
      providers: [OrganizationRepository, CategoryRepository, IngredientRepository, IngredientImportService],
    }).compile();

    dataSource = app.get(DataSource);
    importService = app.get(IngredientImportService);
    categories = app.get(CategoryRepository);
    ingredients = app.get(IngredientRepository);
    organizations = app.get(OrganizationRepository);
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await app?.close();
  });

  let org: Organization;

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "ingredients", "categories", "user_locations", "users", "locations", "organizations" RESTART IDENTITY CASCADE',
    );
    org = await organizations.save(
      Organization.create({
        name: 'Acme',
        currencyCode: 'EUR',
        defaultLocale: 'es',
        timezone: 'Europe/Madrid',
      }),
    );
    await categories.save(
      Category.create({
        organizationId: org.id,
        parentId: null,
        name: 'vegetables',
        nameEs: 'Vegetales',
        nameEn: 'Vegetables',
      }),
    );
  });

  it('dry-run does NOT touch the database', async () => {
    const csv = ['name,categoryName,baseUnitType', 'Tomate,vegetables,WEIGHT', 'Lechuga,vegetables,WEIGHT'].join('\n');
    const before = await ingredients.count();
    const result = await importService.parseAndCommit(Readable.from(csv), {
      organizationId: org.id,
      dryRun: true,
    });
    expect(result).toEqual({ valid: 2, invalid: 0, errors: [] });
    expect(await ingredients.count()).toBe(before);
  });

  it('commit persists valid rows', async () => {
    const csv = [
      'name,categoryName,baseUnitType,internalCode',
      'Tomate,vegetables,WEIGHT,TOM-001',
      'Lechuga,vegetables,WEIGHT,LEC-001',
    ].join('\n');
    const result = await importService.parseAndCommit(Readable.from(csv), {
      organizationId: org.id,
      dryRun: false,
    });
    expect(result).toEqual({ valid: 2, invalid: 0, errors: [] });
    const persisted = await ingredients.findActiveByOrganization(org.id);
    expect(persisted.map((i) => i.name).sort()).toEqual(['Lechuga', 'Tomate']);
  });

  it('NFR §5: 10k rows commit in <60 seconds', async () => {
    const headers = 'name,categoryName,baseUnitType,internalCode';
    const rows: string[] = [];
    for (let i = 0; i < 10_000; i++) {
      rows.push(`Item-${i.toString().padStart(5, '0')},vegetables,WEIGHT,ING-${i.toString().padStart(5, '0')}`);
    }
    const csv = [headers, ...rows].join('\n');
    const start = Date.now();
    const result = await importService.parseAndCommit(Readable.from(csv), {
      organizationId: org.id,
      dryRun: false,
    });
    const elapsed = Date.now() - start;
    expect(result.valid).toBe(10_000);
    expect(result.invalid).toBe(0);
    expect(elapsed).toBeLessThan(60_000);
  }, 90_000);

  it('chunked transaction semantics: poisoned chunk rolls back; prior chunks survive', async () => {
    // We cannot easily inject a CHECK violation through the validator path — the validator
    // catches invariant breaches before they reach SQL. So instead we test the LIVE rollback
    // path by importing a chunk where the INSERT would fail because of duplicate
    // internal_code (unique index). Two rows in chunk 2 reuse the same code; the chunk
    // commits as a transaction so the duplicate aborts the whole chunk.
    const headers = 'name,categoryName,baseUnitType,internalCode';
    const goodChunk = Array.from({ length: 4 }, (_, i) => `A${i},vegetables,WEIGHT,A-${i}`);
    const poisonedChunk = [
      'B0,vegetables,WEIGHT,DUP-CODE',
      'B1,vegetables,WEIGHT,B-1',
      'B2,vegetables,WEIGHT,DUP-CODE',
      'B3,vegetables,WEIGHT,B-3',
    ];
    const csv = [headers, ...goodChunk, ...poisonedChunk].join('\n');

    const result = await importService.parseAndCommit(Readable.from(csv), {
      organizationId: org.id,
      dryRun: false,
      chunkSize: 4,
    });

    // Chunk 1 commits → 4 valid; chunk 2 rolls back → 4 invalid with CSV_IMPORT_CHUNK_ROLLED_BACK.
    expect(result.valid).toBe(4);
    expect(result.invalid).toBe(4);
    expect(result.errors.every((e) => e.code === 'CSV_IMPORT_CHUNK_ROLLED_BACK')).toBe(true);

    const persistedCodes = (await ingredients.findActiveByOrganization(org.id))
      .map((i) => i.internalCode)
      .sort();
    expect(persistedCodes).toEqual(['A-0', 'A-1', 'A-2', 'A-3']);
  });
});
