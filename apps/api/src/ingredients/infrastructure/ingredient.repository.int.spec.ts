import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { Organization } from '../../iam/domain/organization.entity';
import { User } from '../../iam/domain/user.entity';
import { Location } from '../../iam/domain/location.entity';
import { UserLocation } from '../../iam/domain/user-location.entity';
import { OrganizationRepository } from '../../iam/infrastructure/organization.repository';
import { Category } from '../domain/category.entity';
import { Ingredient } from '../domain/ingredient.entity';
import { CategoryRepository } from './category.repository';
import { IngredientRepository } from './ingredient.repository';

const ALL_ENTITIES = [Organization, User, Location, UserLocation, Category, Ingredient];

describe('IngredientRepository (integration)', () => {
  let app: TestingModule;
  let dataSource: DataSource;
  let ingredients: IngredientRepository;
  let categories: CategoryRepository;
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
      providers: [OrganizationRepository, CategoryRepository, IngredientRepository],
    }).compile();

    dataSource = app.get(DataSource);
    ingredients = app.get(IngredientRepository);
    categories = app.get(CategoryRepository);
    organizations = app.get(OrganizationRepository);
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await app?.close();
  });

  let org: Organization;
  let cat: Category;
  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "ingredients", "categories", "user_locations", "users", "locations", "organizations" RESTART IDENTITY CASCADE',
    );
    org = await organizations.save(
      Organization.create({ name: 'Acme', currencyCode: 'EUR', defaultLocale: 'es', timezone: 'Europe/Madrid' }),
    );
    cat = await categories.save(
      Category.create({ organizationId: org.id, parentId: null, name: 'food', nameEs: 'Food', nameEn: 'Food' }),
    );
  });

  it('soft-delete: deactivate excludes from findActiveByOrganization', async () => {
    const ing = await ingredients.save(
      Ingredient.create({ organizationId: org.id, categoryId: cat.id, name: 'Tomate', baseUnitType: 'WEIGHT' }),
    );
    expect(await ingredients.findActiveByOrganization(org.id)).toHaveLength(1);

    ing.deactivate();
    await ingredients.save(ing);
    expect(await ingredients.findActiveByOrganization(org.id)).toHaveLength(0);

    ing.reactivate();
    await ingredients.save(ing);
    expect(await ingredients.findActiveByOrganization(org.id)).toHaveLength(1);
  });

  it('UNIQUE (organization_id, internal_code) enforced', async () => {
    await ingredients.save(
      Ingredient.create({
        organizationId: org.id,
        categoryId: cat.id,
        name: 'Tomate',
        baseUnitType: 'WEIGHT',
        internalCode: 'TOM-001',
      }),
    );
    await expect(
      ingredients.save(
        Ingredient.create({
          organizationId: org.id,
          categoryId: cat.id,
          name: 'Tomate Cherry',
          baseUnitType: 'WEIGHT',
          internalCode: 'TOM-001',
        }),
      ),
    ).rejects.toBeInstanceOf(QueryFailedError);
  });

  it('cursor pagination is deterministic', async () => {
    for (let i = 0; i < 25; i++) {
      await ingredients.save(
        Ingredient.create({
          organizationId: org.id,
          categoryId: cat.id,
          name: `Ing ${String(i).padStart(2, '0')}`,
          baseUnitType: 'WEIGHT',
          internalCode: `ING-${String(i).padStart(3, '0')}`,
        }),
      );
    }

    const page1 = await ingredients.pageByOrganization(org.id, null, 10, false);
    expect(page1.items).toHaveLength(10);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await ingredients.pageByOrganization(org.id, page1.nextCursor, 10, false);
    expect(page2.items).toHaveLength(10);

    const page3 = await ingredients.pageByOrganization(org.id, page2.nextCursor, 10, false);
    expect(page3.items).toHaveLength(5);
    expect(page3.nextCursor).toBeNull();

    const ids = [...page1.items, ...page2.items, ...page3.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(25);
  });

  it('CHECK density forbidden for UNIT enforced at DB', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO "ingredients" (id, organization_id, category_id, name, internal_code, base_unit_type, density_factor)
         VALUES ($1, $2, $3, 'X', 'X-1', 'UNIT', 0.5)`,
        ['44444444-4444-4444-8444-444444444444', org.id, cat.id],
      ),
    ).rejects.toThrow(/ck_ingredients_density_unit_forbidden|check constraint/i);
  });
});
