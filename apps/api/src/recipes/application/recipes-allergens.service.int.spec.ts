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
import { RecipesService } from './recipes.service';
import { RecipesAllergensService } from './recipes-allergens.service';

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

const ACTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('RecipesAllergensService (integration)', () => {
  let app: TestingModule;
  let dataSource: DataSource;
  let recipes: RecipesService;
  let allergens: RecipesAllergensService;
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
      providers: [
        OrganizationRepository,
        CategoryRepository,
        IngredientRepository,
        RecipesService,
        RecipesAllergensService,
      ],
    }).compile();

    dataSource = app.get(DataSource);
    recipes = app.get(RecipesService);
    allergens = app.get(RecipesAllergensService);
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
  let flour: Ingredient;
  let butter: Ingredient;
  let tomato: Ingredient;

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "menu_items", "recipe_ingredients", "recipes", "supplier_items", "suppliers", "ingredients", "categories", "user_locations", "users", "locations", "organizations" RESTART IDENTITY CASCADE',
    );
    org = await organizations.save(
      Organization.create({
        name: 'Acme',
        currencyCode: 'EUR',
        defaultLocale: 'es',
        timezone: 'Europe/Madrid',
      }),
    );
    // Seed an actor User so apply* methods can bump recipe.updatedBy without
    // tripping the fk_recipes_updated_by constraint. The id is fixed because
    // the test asserts override.appliedBy === ACTOR_ID.
    const actor = User.create({
      organizationId: org.id,
      name: 'Test Actor',
      email: 'actor@test.local',
      passwordHash: '$2b$12$KIXMHnFdTsHHBMmEJYRzKePQGyDOuxF7vSj.O5kmaYxLHJyxeBoAi',
      role: 'OWNER',
    });
    actor.id = ACTOR_ID;
    await dataSource.getRepository(User).save(actor);

    category = await categories.save(
      Category.create({
        organizationId: org.id,
        parentId: null,
        name: 'food',
        nameEs: 'Comida',
        nameEn: 'Food',
      }),
    );
    flour = Ingredient.create({
      organizationId: org.id,
      categoryId: category.id,
      name: 'Wheat flour',
      baseUnitType: 'WEIGHT',
    });
    flour.allergens = ['gluten'];
    flour.dietFlags = ['vegetarian'];
    flour = await ingredients.save(flour);

    butter = Ingredient.create({
      organizationId: org.id,
      categoryId: category.id,
      name: 'Butter',
      baseUnitType: 'WEIGHT',
    });
    butter.allergens = ['milk'];
    butter.dietFlags = ['vegetarian'];
    butter = await ingredients.save(butter);

    tomato = Ingredient.create({
      organizationId: org.id,
      categoryId: category.id,
      name: 'Tomato',
      baseUnitType: 'WEIGHT',
    });
    tomato.allergens = [];
    tomato.dietFlags = ['vegan', 'vegetarian'];
    tomato = await ingredients.save(tomato);
  });

  it('round-trips allergen rollup, override, and cross-contamination across two sub-recipe levels', async () => {
    // Sub-recipe carries flour (gluten) + butter (milk).
    const subRoux = await recipes.create({
      organizationId: org.id,
      name: 'Roux',
      description: '',
      wasteFactor: 0,
      lines: [
        { ingredientId: flour.id, quantity: 0.05, unitId: 'kg' },
        { ingredientId: butter.id, quantity: 0.05, unitId: 'kg' },
      ],
    });

    // Mid-recipe composes the sub-recipe + tomato.
    const subBechamel = await recipes.create({
      organizationId: org.id,
      name: 'Bechamel',
      description: '',
      wasteFactor: 0,
      lines: [
        { subRecipeId: subRoux.recipe.id, quantity: 1, unitId: 'kg' },
        { ingredientId: tomato.id, quantity: 0.5, unitId: 'kg' },
      ],
    });

    // Top-level Lasagna composes Bechamel.
    const lasagna = await recipes.create({
      organizationId: org.id,
      name: 'Lasagna',
      description: '',
      wasteFactor: 0,
      lines: [{ subRecipeId: subBechamel.recipe.id, quantity: 1, unitId: 'kg' }],
    });

    // Aggregation walks two levels and unions all leaves.
    let allergensRollup = await allergens.getAllergensRollup(org.id, lasagna.recipe.id);
    expect(allergensRollup.aggregated).toEqual(['gluten', 'milk']);
    expect(allergensRollup.byIngredient[flour.id]).toEqual(['gluten']);
    expect(allergensRollup.byIngredient[butter.id]).toEqual(['milk']);
    expect(allergensRollup.byIngredient[tomato.id]).toEqual([]);
    expect(allergensRollup.crossContamination).toEqual({ note: null, allergens: [] });

    // Diet-flag inference: vegan dropped (milk contradicts), vegetarian holds.
    const dietRollup = await allergens.getDietFlagsRollup(org.id, lasagna.recipe.id);
    expect(dietRollup.inferred).toEqual(['vegetarian']);
    expect(dietRollup.warnings.some((w) => /vegan/.test(w))).toBe(true);

    // Apply Manager+ override on allergens (add sesame, remove milk).
    await allergens.applyAllergensOverride(org.id, ACTOR_ID, lasagna.recipe.id, {
      add: ['sesame'],
      remove: ['milk'],
      reason: 'Sesame oil added in finishing step; verified butter switched to dairy-free spread',
    });
    allergensRollup = await allergens.getAllergensRollup(org.id, lasagna.recipe.id);
    expect(allergensRollup.aggregated).toEqual(['gluten', 'sesame']);
    expect(allergensRollup.override?.appliedBy).toBe(ACTOR_ID);
    expect(allergensRollup.override?.reason).toMatch(/Sesame/);

    // Apply cross-contamination — both note + tags, persisted alongside (not in `aggregated`).
    await allergens.applyCrossContamination(org.id, ACTOR_ID, lasagna.recipe.id, {
      note: 'Made on shared line with peanuts',
      allergens: ['peanuts'],
    });
    allergensRollup = await allergens.getAllergensRollup(org.id, lasagna.recipe.id);
    expect(allergensRollup.crossContamination.note).toBe('Made on shared line with peanuts');
    expect(allergensRollup.crossContamination.allergens).toEqual(['peanuts']);
    expect(allergensRollup.aggregated).not.toContain('peanuts');

    // Apply diet-flag override.
    await allergens.applyDietFlagsOverride(org.id, ACTOR_ID, lasagna.recipe.id, {
      flags: ['vegetarian', 'halal'],
      reason: 'Halal-certified per supplier letter 2026-04-30',
    });
    const dietAfter = await allergens.getDietFlagsRollup(org.id, lasagna.recipe.id);
    expect(dietAfter.inferred).toEqual(['vegetarian', 'halal']);
    expect(dietAfter.override?.reason).toMatch(/Halal/);
  });
});
