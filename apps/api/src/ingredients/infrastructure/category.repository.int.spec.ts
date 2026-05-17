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

describe('CategoryRepository (integration)', () => {
  let app: TestingModule;
  let dataSource: DataSource;
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
      providers: [OrganizationRepository, CategoryRepository, IngredientRepository],
    }).compile();

    dataSource = app.get(DataSource);
    categories = app.get(CategoryRepository);
    ingredients = app.get(IngredientRepository);
    organizations = app.get(OrganizationRepository);
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

  async function seedOrg(): Promise<Organization> {
    return organizations.save(
      Organization.create({ name: 'Acme', currencyCode: 'EUR', defaultLocale: 'es', timezone: 'Europe/Madrid' }),
    );
  }

  it('RESTRICT: cannot delete a category with children', async () => {
    const org = await seedOrg();
    const parent = await categories.save(
      Category.create({
        organizationId: org.id,
        parentId: null,
        name: 'meat',
        nameEs: 'Carnes',
        nameEn: 'Meat',
      }),
    );
    await categories.save(
      Category.create({
        organizationId: org.id,
        parentId: parent.id,
        name: 'beef',
        nameEs: 'Vacuno',
        nameEn: 'Beef',
      }),
    );
    await expect(categories.delete({ id: parent.id })).rejects.toBeInstanceOf(QueryFailedError);
  });

  it('RESTRICT: cannot delete a category with linked ingredients', async () => {
    const org = await seedOrg();
    const cat = await categories.save(
      Category.create({
        organizationId: org.id,
        parentId: null,
        name: 'meat',
        nameEs: 'Carnes',
        nameEn: 'Meat',
      }),
    );
    await ingredients.save(
      Ingredient.create({
        organizationId: org.id,
        categoryId: cat.id,
        name: 'Tomate',
        baseUnitType: 'WEIGHT',
      }),
    );
    await expect(categories.delete({ id: cat.id })).rejects.toBeInstanceOf(QueryFailedError);
  });

  it('recursive CTE returns the full tree depth-ordered', async () => {
    const org = await seedOrg();
    const root = await categories.save(
      Category.create({ organizationId: org.id, parentId: null, name: 'food', nameEs: 'Comida', nameEn: 'Food' }),
    );
    const meat = await categories.save(
      Category.create({ organizationId: org.id, parentId: root.id, name: 'meat', nameEs: 'Carnes', nameEn: 'Meat' }),
    );
    await categories.save(
      Category.create({ organizationId: org.id, parentId: meat.id, name: 'beef', nameEs: 'Vacuno', nameEn: 'Beef' }),
    );

    const tree = await categories.findTreeByOrganization(org.id);
    expect(tree).toHaveLength(3);
    expect(tree[0].id).toBe(root.id);
    expect(tree[1].id).toBe(meat.id);
  });

  it('UNIQUE (organization, parent, name) enforced', async () => {
    const org = await seedOrg();
    await categories.save(
      Category.create({ organizationId: org.id, parentId: null, name: 'meat', nameEs: 'X', nameEn: 'X' }),
    );
    await expect(
      categories.save(
        Category.create({ organizationId: org.id, parentId: null, name: 'meat', nameEs: 'Y', nameEn: 'Y' }),
      ),
    ).rejects.toBeInstanceOf(QueryFailedError);
  });
});
