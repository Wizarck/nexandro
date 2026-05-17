import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Organization } from '../../iam/domain/organization.entity';
import { User } from '../../iam/domain/user.entity';
import { Location } from '../../iam/domain/location.entity';
import { UserLocation } from '../../iam/domain/user-location.entity';
import { OrganizationRepository } from '../../iam/infrastructure/organization.repository';
import { Category } from '../../ingredients/domain/category.entity';
import { Ingredient } from '../../ingredients/domain/ingredient.entity';
import { CategoryRepository } from '../../ingredients/infrastructure/category.repository';
import { IngredientRepository } from '../../ingredients/infrastructure/ingredient.repository';
import { MenuItem } from '../../menus/domain/menu-item.entity';
import { Supplier } from '../../suppliers/domain/supplier.entity';
import { SupplierItem } from '../../suppliers/domain/supplier-item.entity';
import { Recipe } from '../domain/recipe.entity';
import { RecipeIngredient } from '../domain/recipe-ingredient.entity';
import { CycleDetectedError } from './cycle-detector';
import {
  RecipeNotFoundError,
  RecipesService,
  RecipeInUseError,
} from './recipes.service';

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
];

describe('RecipesService (integration)', () => {
  let app: TestingModule;
  let dataSource: DataSource;
  let service: RecipesService;
  let categories: CategoryRepository;
  let ingredients: IngredientRepository;
  let organizations: OrganizationRepository;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
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
      providers: [OrganizationRepository, CategoryRepository, IngredientRepository, RecipesService],
    }).compile();

    dataSource = app.get(DataSource);
    service = app.get(RecipesService);
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
  let category: Category;
  let ingredient: Ingredient;

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "menu_items", "recipe_ingredients", "recipes", "supplier_items", "suppliers", "ingredients", "categories", "user_locations", "users", "locations", "organizations" RESTART IDENTITY CASCADE',
    );
    org = await organizations.save(
      Organization.create({ name: 'Acme', currencyCode: 'EUR', defaultLocale: 'es', timezone: 'Europe/Madrid' }),
    );
    category = await categories.save(
      Category.create({ organizationId: org.id, parentId: null, name: 'food', nameEs: 'Comida', nameEn: 'Food' }),
    );
    ingredient = await ingredients.save(
      Ingredient.create({
        organizationId: org.id,
        categoryId: category.id,
        name: 'Tomate',
        baseUnitType: 'WEIGHT',
      }),
    );
  });

  it('creates a Recipe with a single Ingredient line', async () => {
    const result = await service.create({
      organizationId: org.id,
      name: 'Bolognesa',
      description: 'Ragú',
      wasteFactor: 0.05,
      lines: [{ ingredientId: ingredient.id, quantity: 0.25, unitId: 'kg' }],
    });
    expect(result.recipe.name).toBe('Bolognesa');
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].ingredientId).toBe(ingredient.id);
    expect(result.displayLabel).toBe('Bolognesa');
  });

  it('creates a Recipe composing a sub-Recipe', async () => {
    const sub = await service.create({
      organizationId: org.id,
      name: 'Salsa',
      description: '',
      wasteFactor: 0,
      lines: [{ ingredientId: ingredient.id, quantity: 0.1, unitId: 'kg' }],
    });
    const parent = await service.create({
      organizationId: org.id,
      name: 'Pasta',
      description: '',
      wasteFactor: 0,
      lines: [
        { ingredientId: ingredient.id, quantity: 0.2, unitId: 'kg' },
        { subRecipeId: sub.recipe.id, quantity: 1, unitId: 'kg' },
      ],
    });
    expect(parent.lines).toHaveLength(2);
    expect(parent.lines.find((l) => l.subRecipeId === sub.recipe.id)).toBeDefined();
  });

  it('rejects a direct cycle: A → B → A on update', async () => {
    const a = await service.create({
      organizationId: org.id,
      name: 'A',
      description: '',
      wasteFactor: 0,
      lines: [{ ingredientId: ingredient.id, quantity: 1, unitId: 'kg' }],
    });
    const b = await service.create({
      organizationId: org.id,
      name: 'B',
      description: '',
      wasteFactor: 0,
      lines: [{ subRecipeId: a.recipe.id, quantity: 1, unitId: 'kg' }],
    });

    await expect(
      service.update(org.id, a.recipe.id, {
        lines: [{ subRecipeId: b.recipe.id, quantity: 1, unitId: 'kg' }],
      }),
    ).rejects.toBeInstanceOf(CycleDetectedError);
  });

  it('rejects self-reference on create', async () => {
    // Self-reference is impossible to construct via the public API because the recipe id
    // is generated server-side. We cover the scenario by passing a manually-built input
    // where the proposed sub-recipe id collides with the recipe's own id (simulated via
    // a stub recipe persisted first). Use update instead — equivalent assertion.
    const r = await service.create({
      organizationId: org.id,
      name: 'X',
      description: '',
      wasteFactor: 0,
      lines: [{ ingredientId: ingredient.id, quantity: 1, unitId: 'kg' }],
    });
    await expect(
      service.update(org.id, r.recipe.id, {
        lines: [{ subRecipeId: r.recipe.id, quantity: 1, unitId: 'kg' }],
      }),
    ).rejects.toBeInstanceOf(CycleDetectedError);
  });

  it('soft-delete works when no MenuItem references the recipe', async () => {
    const r = await service.create({
      organizationId: org.id,
      name: 'X',
      description: '',
      wasteFactor: 0,
      lines: [{ ingredientId: ingredient.id, quantity: 1, unitId: 'kg' }],
    });
    await service.softDelete(org.id, r.recipe.id);
    const reload = await service.findOne(org.id, r.recipe.id);
    expect(reload.recipe.isActive).toBe(false);
    expect(reload.displayLabel).toBe('X (Discontinued)');
  });

  it('soft-delete is blocked when an active MenuItem references the recipe', async () => {
    const location = await dataSource.getRepository(Location).save(
      Location.create({ organizationId: org.id, name: 'A', address: '', type: 'RESTAURANT' }),
    );
    const r = await service.create({
      organizationId: org.id,
      name: 'X',
      description: '',
      wasteFactor: 0,
      lines: [{ ingredientId: ingredient.id, quantity: 1, unitId: 'kg' }],
    });
    await dataSource.getRepository(MenuItem).save(
      MenuItem.create({
        organizationId: org.id,
        recipeId: r.recipe.id,
        locationId: location.id,
        channel: 'DINE_IN',
        sellingPrice: 10,
        targetMargin: 0.6,
      }),
    );
    await expect(service.softDelete(org.id, r.recipe.id)).rejects.toBeInstanceOf(RecipeInUseError);
  });

  it('cross-org isolation: org B cannot read org A recipes', async () => {
    const orgB = await organizations.save(
      Organization.create({ name: 'B', currencyCode: 'EUR', defaultLocale: 'es', timezone: 'Europe/Madrid' }),
    );
    const r = await service.create({
      organizationId: org.id,
      name: 'OnlyA',
      description: '',
      wasteFactor: 0,
      lines: [{ ingredientId: ingredient.id, quantity: 1, unitId: 'kg' }],
    });
    await expect(service.findOne(orgB.id, r.recipe.id)).rejects.toBeInstanceOf(RecipeNotFoundError);
  });

  it('selectableForSubRecipe filter excludes inactive recipes', async () => {
    const r = await service.create({
      organizationId: org.id,
      name: 'Will deactivate',
      description: '',
      wasteFactor: 0,
      lines: [{ ingredientId: ingredient.id, quantity: 1, unitId: 'kg' }],
    });
    await service.softDelete(org.id, r.recipe.id);
    const all = await service.findAll(org.id, { selectableForSubRecipe: false });
    const selectable = await service.findAll(org.id, { selectableForSubRecipe: true });
    expect(all.length).toBe(1);
    expect(selectable.length).toBe(0);
  });
});
