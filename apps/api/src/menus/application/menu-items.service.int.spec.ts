import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditLog } from '../../audit-log/domain/audit-log.entity';
import { AuditLogService } from '../../audit-log/application/audit-log.service';
import { AuditLogSubscriber } from '../../audit-log/application/audit-log.subscriber';
import { CostService } from '../../cost/application/cost.service';
import { PreferredSupplierResolver } from '../../cost/application/preferred-supplier.resolver';
import { INVENTORY_COST_RESOLVER } from '../../cost/inventory-cost-resolver';
import { Organization } from '../../iam/domain/organization.entity';
import { Location } from '../../iam/domain/location.entity';
import { User } from '../../iam/domain/user.entity';
import { UserLocation } from '../../iam/domain/user-location.entity';
import { LocationRepository } from '../../iam/infrastructure/location.repository';
import { OrganizationRepository } from '../../iam/infrastructure/organization.repository';
import { Category } from '../../ingredients/domain/category.entity';
import { Ingredient } from '../../ingredients/domain/ingredient.entity';
import { CategoryRepository } from '../../ingredients/infrastructure/category.repository';
import { IngredientRepository } from '../../ingredients/infrastructure/ingredient.repository';
import { Recipe } from '../../recipes/domain/recipe.entity';
import { RecipeIngredient } from '../../recipes/domain/recipe-ingredient.entity';
import { RecipeRepository } from '../../recipes/infrastructure/recipe.repository';
import { Supplier } from '../../suppliers/domain/supplier.entity';
import { SupplierItem } from '../../suppliers/domain/supplier-item.entity';
import { SupplierItemRepository } from '../../suppliers/infrastructure/supplier-item.repository';
import { SupplierRepository } from '../../suppliers/infrastructure/supplier.repository';
import { MenuItem } from '../domain/menu-item.entity';
import { MenuItemRepository } from '../infrastructure/menu-item.repository';
import { MenuItemDuplicateError, MenuItemsService } from './menu-items.service';

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
  AuditLog,
];

describe('MenuItemsService (integration)', () => {
  let app: TestingModule;
  let dataSource: DataSource;
  let menuItems: MenuItemsService;
  let organizations: OrganizationRepository;
  let locations: LocationRepository;
  let categories: CategoryRepository;
  let ingredients: IngredientRepository;
  let suppliers: SupplierRepository;
  let supplierItems: SupplierItemRepository;

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
        LocationRepository,
        CategoryRepository,
        IngredientRepository,
        SupplierRepository,
        SupplierItemRepository,
        RecipeRepository,
        MenuItemRepository,
        AuditLogService,
        AuditLogSubscriber,
        PreferredSupplierResolver,
        { provide: INVENTORY_COST_RESOLVER, useExisting: PreferredSupplierResolver },
        CostService,
        MenuItemsService,
      ],
    }).compile();

    dataSource = app.get(DataSource);
    menuItems = app.get(MenuItemsService);
    organizations = app.get(OrganizationRepository);
    locations = app.get(LocationRepository);
    categories = app.get(CategoryRepository);
    ingredients = app.get(IngredientRepository);
    suppliers = app.get(SupplierRepository);
    supplierItems = app.get(SupplierItemRepository);
    await dataSource.runMigrations();
    // Required for EventSubscribersLoader to attach @OnEvent handlers on
    // AuditLogSubscriber. Without this, RECIPE_COST_REBUILT events emit into
    // the void and audit_log stays empty.
    await app.init();
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await app?.close();
  });

  let org: Organization;
  let location: Location;
  let recipe: Recipe;

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "audit_log", "menu_items", "recipe_ingredients", "recipes", "supplier_items", "suppliers", "ingredients", "categories", "user_locations", "users", "locations", "organizations" RESTART IDENTITY CASCADE',
    );
    org = await organizations.save(
      Organization.create({
        name: 'Acme',
        currencyCode: 'EUR',
        defaultLocale: 'es',
        timezone: 'Europe/Madrid',
      }),
    );
    location = await locations.save(
      Location.create({ organizationId: org.id, name: 'Main', address: '', type: 'RESTAURANT' }),
    );
    const cat = await categories.save(
      Category.create({ organizationId: org.id, parentId: null, name: 'food', nameEs: 'Comida', nameEn: 'Food' }),
    );
    const ingredient = await ingredients.save(
      Ingredient.create({
        organizationId: org.id,
        categoryId: cat.id,
        name: 'Tomate',
        baseUnitType: 'WEIGHT',
      }),
    );
    const supplier = await suppliers.save(
      Supplier.create({ organizationId: org.id, name: 'Distri Levante', country: 'ES' }),
    );
    const item = SupplierItem.create({
      supplierId: supplier.id,
      ingredientId: ingredient.id,
      purchaseUnit: '5 kg',
      purchaseUnitQty: 5,
      purchaseUnitType: 'kg',
      unitPrice: 25,
      isPreferred: true,
    });
    item.costPerBaseUnit = item.computeCostPerBaseUnit(ingredient);
    await supplierItems.save(item);
    recipe = await dataSource.getRepository(Recipe).save(
      Recipe.create({ organizationId: org.id, name: 'Salsa', description: '', wasteFactor: 0 }),
    );
    await dataSource.getRepository(RecipeIngredient).save(
      RecipeIngredient.create({
        recipeId: recipe.id,
        ingredientId: ingredient.id,
        subRecipeId: null,
        quantity: 0.5,
        unitId: 'kg',
      }),
    );
  });

  it('creates a MenuItem and computes a green margin via the live cost path', async () => {
    const view = await menuItems.create({
      organizationId: org.id,
      recipeId: recipe.id,
      locationId: location.id,
      channel: 'DINE_IN',
      sellingPrice: 10,
      targetMargin: 0.5,
    });
    const report = await menuItems.getMargin(org.id, view.menuItem.id);
    // 0.5 kg × €0.005/g = 2.5; margin = 7.5; pct = 0.75 → on_target.
    expect(report.cost).toBe(2.5);
    expect(report.status).toBe('on_target');
    expect(report.warnings).toEqual([]);
  });

  it('rejects a duplicate active MenuItem on (recipe, location, channel)', async () => {
    await menuItems.create({
      organizationId: org.id,
      recipeId: recipe.id,
      locationId: location.id,
      channel: 'DINE_IN',
      sellingPrice: 10,
      targetMargin: 0.5,
    });
    await expect(
      menuItems.create({
        organizationId: org.id,
        recipeId: recipe.id,
        locationId: location.id,
        channel: 'DINE_IN',
        sellingPrice: 12,
        targetMargin: 0.55,
      }),
    ).rejects.toBeInstanceOf(MenuItemDuplicateError);
  });

  it('allows recreation after soft-delete (partial unique index honours is_active=true)', async () => {
    const first = await menuItems.create({
      organizationId: org.id,
      recipeId: recipe.id,
      locationId: location.id,
      channel: 'DINE_IN',
      sellingPrice: 10,
      targetMargin: 0.5,
    });
    await menuItems.softDelete(org.id, first.menuItem.id);
    const second = await menuItems.create({
      organizationId: org.id,
      recipeId: recipe.id,
      locationId: location.id,
      channel: 'DINE_IN',
      sellingPrice: 12,
      targetMargin: 0.6,
    });
    expect(second.menuItem.id).not.toBe(first.menuItem.id);
  });

  it('soft-delete propagates the Discontinued badge to dependent MenuItem displayLabel', async () => {
    const view = await menuItems.create({
      organizationId: org.id,
      recipeId: recipe.id,
      locationId: location.id,
      channel: 'DINE_IN',
      sellingPrice: 10,
      targetMargin: 0.5,
    });
    // Soft-delete the parent recipe directly — bypassing RecipesService.softDelete to avoid
    // the active-MenuItem guard, which is itself a separate slice's responsibility.
    recipe.deactivate();
    await dataSource.getRepository(Recipe).save(recipe);
    const refreshed = await menuItems.findOne(org.id, view.menuItem.id);
    expect(refreshed.recipeDiscontinued).toBe(true);
    expect(refreshed.displayLabel).toMatch(/Discontinued/);
  });
});
