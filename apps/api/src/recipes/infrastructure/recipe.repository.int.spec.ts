import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
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
import { MenuItemRepository } from '../../menus/infrastructure/menu-item.repository';
import { Supplier } from '../../suppliers/domain/supplier.entity';
import { SupplierItem } from '../../suppliers/domain/supplier-item.entity';
import { Recipe } from '../domain/recipe.entity';
import { RecipeIngredient } from '../domain/recipe-ingredient.entity';
import { RecipeIngredientRepository } from './recipe-ingredient.repository';
import { RecipeRepository } from './recipe.repository';

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

describe('M2 data model (integration) — migration 0009 round-trip', () => {
  let app: TestingModule;
  let dataSource: DataSource;
  let recipes: RecipeRepository;
  let recipeIngredients: RecipeIngredientRepository;
  let menuItems: MenuItemRepository;
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
      providers: [
        OrganizationRepository,
        CategoryRepository,
        IngredientRepository,
        RecipeRepository,
        RecipeIngredientRepository,
        MenuItemRepository,
      ],
    }).compile();

    dataSource = app.get(DataSource);
    recipes = app.get(RecipeRepository);
    recipeIngredients = app.get(RecipeIngredientRepository);
    menuItems = app.get(MenuItemRepository);
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
  let category: Category;

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
  });

  it('Recipe + RecipeIngredient pointing to an Ingredient persists end-to-end', async () => {
    const ingredient = await ingredients.save(
      Ingredient.create({
        organizationId: org.id,
        categoryId: category.id,
        name: 'Tomate',
        baseUnitType: 'WEIGHT',
      }),
    );
    const recipe = await recipes.save(
      Recipe.create({
        organizationId: org.id,
        name: 'Bolognesa',
        description: 'Ragú',
        wasteFactor: 0.05,
      }),
    );
    const ri = await recipeIngredients.save(
      RecipeIngredient.create({
        recipeId: recipe.id,
        ingredientId: ingredient.id,
        subRecipeId: null,
        quantity: 0.25,
        unitId: 'kg',
      }),
    );
    const reload = await recipeIngredients.findOneBy({ id: ri.id });
    expect(reload?.recipeId).toBe(recipe.id);
    expect(reload?.ingredientId).toBe(ingredient.id);
    expect(reload?.subRecipeId).toBeNull();
  });

  it('CHECK constraint rejects line with both ingredientId AND subRecipeId set', async () => {
    const ingredient = await ingredients.save(
      Ingredient.create({
        organizationId: org.id,
        categoryId: category.id,
        name: 'Tomate',
        baseUnitType: 'WEIGHT',
      }),
    );
    const parent = await recipes.save(
      Recipe.create({ organizationId: org.id, name: 'Parent', description: '', wasteFactor: 0 }),
    );
    const sub = await recipes.save(
      Recipe.create({ organizationId: org.id, name: 'Sub', description: '', wasteFactor: 0 }),
    );
    await expect(
      dataSource.query(
        `INSERT INTO "recipe_ingredients"
           (id, recipe_id, ingredient_id, sub_recipe_id, quantity, unit_id)
         VALUES ($1, $2, $3, $4, 1, 'kg')`,
        ['cccccccc-1111-4111-8111-cccccccccccc', parent.id, ingredient.id, sub.id],
      ),
    ).rejects.toBeInstanceOf(QueryFailedError);
  });

  it('CHECK constraint rejects line with NEITHER ingredientId NOR subRecipeId', async () => {
    const recipe = await recipes.save(
      Recipe.create({ organizationId: org.id, name: 'X', description: '', wasteFactor: 0 }),
    );
    await expect(
      dataSource.query(
        `INSERT INTO "recipe_ingredients" (id, recipe_id, quantity, unit_id)
         VALUES ($1, $2, 1, 'kg')`,
        ['cccccccc-2222-4222-8222-cccccccccccc', recipe.id],
      ),
    ).rejects.toBeInstanceOf(QueryFailedError);
  });

  it('CASCADE: deleting a Recipe wipes its RecipeIngredient rows', async () => {
    const ingredient = await ingredients.save(
      Ingredient.create({ organizationId: org.id, categoryId: category.id, name: 'X', baseUnitType: 'WEIGHT' }),
    );
    const recipe = await recipes.save(
      Recipe.create({ organizationId: org.id, name: 'X', description: '', wasteFactor: 0 }),
    );
    await recipeIngredients.save(
      RecipeIngredient.create({
        recipeId: recipe.id,
        ingredientId: ingredient.id,
        subRecipeId: null,
        quantity: 1,
        unitId: 'kg',
      }),
    );
    await recipes.delete({ id: recipe.id });
    expect(await recipeIngredients.findByRecipe(recipe.id)).toHaveLength(0);
  });

  it('RESTRICT: cannot delete a Recipe that has live MenuItems', async () => {
    const location = await dataSource.getRepository(Location).save(
      Location.create({ organizationId: org.id, name: 'A', address: '', type: 'RESTAURANT' }),
    );
    const recipe = await recipes.save(
      Recipe.create({ organizationId: org.id, name: 'X', description: '', wasteFactor: 0 }),
    );
    await menuItems.save(
      MenuItem.create({
        organizationId: org.id,
        recipeId: recipe.id,
        locationId: location.id,
        channel: 'DINE_IN',
        sellingPrice: 10,
        targetMargin: 0.6,
      }),
    );
    await expect(recipes.delete({ id: recipe.id })).rejects.toBeInstanceOf(QueryFailedError);
  });

  it('RESTRICT: cannot delete an Ingredient referenced by a RecipeIngredient', async () => {
    const ingredient = await ingredients.save(
      Ingredient.create({ organizationId: org.id, categoryId: category.id, name: 'X', baseUnitType: 'WEIGHT' }),
    );
    const recipe = await recipes.save(
      Recipe.create({ organizationId: org.id, name: 'X', description: '', wasteFactor: 0 }),
    );
    await recipeIngredients.save(
      RecipeIngredient.create({
        recipeId: recipe.id,
        ingredientId: ingredient.id,
        subRecipeId: null,
        quantity: 1,
        unitId: 'kg',
      }),
    );
    await expect(ingredients.delete({ id: ingredient.id })).rejects.toBeInstanceOf(QueryFailedError);
  });

  it('Ingredient extensions (jsonb + arrays) round-trip correctly', async () => {
    const ing = await ingredients.save(
      Ingredient.create({
        organizationId: org.id,
        categoryId: category.id,
        name: 'Aceite',
        baseUnitType: 'VOLUME',
        densityFactor: 0.92,
      }),
    );
    ing.nutrition = { kcal: 884, fatG: 100, carbG: 0, proteinG: 0 };
    ing.allergens = ['gluten-free'];
    ing.dietFlags = ['vegan'];
    ing.brandName = 'Heinz';
    ing.externalSourceRef = 'OFF:1234567890';
    await ingredients.save(ing);

    const reload = await ingredients.findOneBy({ id: ing.id });
    expect(reload?.nutrition).toEqual({ kcal: 884, fatG: 100, carbG: 0, proteinG: 0 });
    expect(reload?.allergens).toEqual(['gluten-free']);
    expect(reload?.dietFlags).toEqual(['vegan']);
    expect(reload?.brandName).toBe('Heinz');
    expect(reload?.externalSourceRef).toBe('OFF:1234567890');
  });

  it('Cross-org isolation: a Recipe from org A is invisible to org B at repo level', async () => {
    const orgB = await organizations.save(
      Organization.create({ name: 'B', currencyCode: 'EUR', defaultLocale: 'es', timezone: 'Europe/Madrid' }),
    );
    await recipes.save(
      Recipe.create({ organizationId: org.id, name: 'OnlyA', description: '', wasteFactor: 0 }),
    );
    expect(await recipes.findActiveByOrganization(org.id)).toHaveLength(1);
    expect(await recipes.findActiveByOrganization(orgB.id)).toHaveLength(0);
  });
});
