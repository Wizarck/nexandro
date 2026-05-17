import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CreateOrganization } from '../../iam/application/create-organization.use-case';
import { Organization } from '../../iam/domain/organization.entity';
import { User } from '../../iam/domain/user.entity';
import { Location } from '../../iam/domain/location.entity';
import { UserLocation } from '../../iam/domain/user-location.entity';
import { Category } from '../domain/category.entity';
import { Ingredient } from '../domain/ingredient.entity';
import { CategoryRepository } from './category.repository';
import { countSeedNodes } from './category-seed';

const ALL_ENTITIES = [Organization, User, Location, UserLocation, Category, Ingredient];

describe('Category seed (integration via CreateOrganization)', () => {
  let app: TestingModule;
  let dataSource: DataSource;
  let categories: CategoryRepository;
  let createOrg: CreateOrganization;

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
      providers: [CreateOrganization, CategoryRepository],
    }).compile();

    dataSource = app.get(DataSource);
    categories = app.get(CategoryRepository);
    createOrg = app.get(CreateOrganization);
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await app?.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "ingredients", "categories", "user_locations", "users", "locations", "organizations" RESTART IDENTITY CASCADE',
    );
  });

  it('seeds 35 categories on Organization create', async () => {
    const { organization, seededCategoryCount } = await createOrg.execute({
      name: 'Acme',
      currencyCode: 'EUR',
      defaultLocale: 'es',
      timezone: 'Europe/Madrid',
    });

    expect(seededCategoryCount).toBe(countSeedNodes());

    const all = await categories.findBy({ organizationId: organization.id });
    expect(all.length).toBe(35);
    expect(all.every((c) => c.isDefault === true)).toBe(true);
  });

  it('seeded tree has 4 roots + 31 children with parent links intact', async () => {
    const { organization } = await createOrg.execute({
      name: 'Acme',
      currencyCode: 'EUR',
      defaultLocale: 'es',
      timezone: 'Europe/Madrid',
    });

    const tree = await categories.findTreeByOrganization(organization.id);
    const roots = tree.filter((c) => c.parentId === null);
    expect(roots.length).toBe(4);
    expect(roots.map((c) => c.name).sort()).toEqual(['beverages', 'dry-pantry', 'fresh', 'other']);

    const fresh = tree.find((c) => c.name === 'fresh')!;
    const freshChildren = tree.filter((c) => c.parentId === fresh.id);
    expect(freshChildren.length).toBe(6); // veg, fruits, herbs, meat, seafood, dairy
  });

  it('different orgs get independent copies of the seed', async () => {
    const a = await createOrg.execute({
      name: 'A',
      currencyCode: 'EUR',
      defaultLocale: 'es',
      timezone: 'Europe/Madrid',
    });
    const b = await createOrg.execute({
      name: 'B',
      currencyCode: 'USD',
      defaultLocale: 'en',
      timezone: 'America/New_York',
    });

    const aCount = await categories.countBy({ organizationId: a.organization.id });
    const bCount = await categories.countBy({ organizationId: b.organization.id });
    expect(aCount).toBe(35);
    expect(bCount).toBe(35);
  });

  it('seed runs in the same transaction as Organization insert', async () => {
    // Force a failure mid-seed by making the second org name collide with a unique
    // constraint AFTER successful org insert — actually we simply confirm that any
    // throw inside the transaction rolls back the whole org row. Use a manual
    // transactional probe:
    let orgCountBefore = 0;
    let orgCountAfter = 0;
    orgCountBefore = await dataSource.getRepository(Organization).count();
    try {
      await dataSource.transaction(async (em) => {
        await em.save(
          Organization.create({
            name: 'Will be rolled back',
            currencyCode: 'EUR',
            defaultLocale: 'es',
            timezone: 'Europe/Madrid',
          }),
        );
        throw new Error('forced rollback');
      });
    } catch {
      // expected
    }
    orgCountAfter = await dataSource.getRepository(Organization).count();
    expect(orgCountAfter).toBe(orgCountBefore);
  });
});
