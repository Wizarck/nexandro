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
import { Recipe } from '../../recipes/domain/recipe.entity';
import { RecipeIngredient } from '../../recipes/domain/recipe-ingredient.entity';
import { Supplier } from '../../suppliers/domain/supplier.entity';
import { SupplierItem } from '../../suppliers/domain/supplier-item.entity';
import { SupplierItemRepository } from '../../suppliers/infrastructure/supplier-item.repository';
import { SupplierRepository } from '../../suppliers/infrastructure/supplier.repository';
import { CostService } from './cost.service';
import { PreferredSupplierResolver } from './preferred-supplier.resolver';
import { AuditLog } from '../../audit-log/domain/audit-log.entity';
import { AuditLogService } from '../../audit-log/application/audit-log.service';
import { AuditLogSubscriber } from '../../audit-log/application/audit-log.subscriber';
import { INVENTORY_COST_RESOLVER } from '../inventory-cost-resolver';

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

describe('CostService (integration)', () => {
  let app: TestingModule;
  let dataSource: DataSource;
  let cost: CostService;
  let organizations: OrganizationRepository;
  let categories: CategoryRepository;
  let ingredients: IngredientRepository;
  let suppliers: SupplierRepository;
  let supplierItems: SupplierItemRepository;
  let auditLog: AuditLogService;

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
        SupplierRepository,
        SupplierItemRepository,
        AuditLogService,
        AuditLogSubscriber,
        PreferredSupplierResolver,
        { provide: INVENTORY_COST_RESOLVER, useExisting: PreferredSupplierResolver },
        CostService,
      ],
    }).compile();

    dataSource = app.get(DataSource);
    cost = app.get(CostService);
    organizations = app.get(OrganizationRepository);
    categories = app.get(CategoryRepository);
    ingredients = app.get(IngredientRepository);
    suppliers = app.get(SupplierRepository);
    supplierItems = app.get(SupplierItemRepository);
    auditLog = app.get(AuditLogService);
    await dataSource.runMigrations();
    // app.init() runs onApplicationBootstrap() hooks; required for
    // EventSubscribersLoader to attach AuditLogSubscriber's @OnEvent handlers.
    await app.init();
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await app?.close();
  });

  let org: Organization;
  let category: Category;
  let ingredient: Ingredient;
  let supplier: Supplier;
  let preferred: SupplierItem;
  let recipe: Recipe;

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "audit_log", "menu_items", "recipe_ingredients", "recipes", "supplier_items", "suppliers", "ingredients", "categories", "user_locations", "users", "locations", "organizations" RESTART IDENTITY CASCADE',
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
    supplier = await suppliers.save(
      Supplier.create({ organizationId: org.id, name: 'Distri Levante', country: 'ES' }),
    );
    const item = SupplierItem.create({
      supplierId: supplier.id,
      ingredientId: ingredient.id,
      purchaseUnit: '5 kg Box',
      purchaseUnitQty: 5,
      purchaseUnitType: 'kg',
      unitPrice: 25,
      isPreferred: true,
    });
    item.costPerBaseUnit = item.computeCostPerBaseUnit(ingredient);
    preferred = await supplierItems.save(item);
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

  it('computes recipe cost end-to-end via the preferred supplier item', async () => {
    const breakdown = await cost.computeRecipeCost(org.id, recipe.id);
    // 0.5 kg × €0.005/g = 0.5 × 1000 × 0.005 = 2.5
    expect(breakdown.totalCost).toBe(2.5);
    expect(breakdown.components[0].sourceRefId).toBe(preferred.id);
    expect(breakdown.currency).toBe('EUR');
  });

  it('records a snapshot and reads it back via getHistory', async () => {
    await cost.recordSnapshot(org.id, recipe.id, 'INITIAL');
    const rows = await cost.getHistory(org.id, recipe.id, 14);
    // 1 component row + 1 totals row
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const totalsRow = rows.find((r) => r.componentRefId === null);
    expect(totalsRow).toBeDefined();
    expect(Number(totalsRow!.totalCost)).toBe(2.5);
  });

  it('honours sourceOverrideRef end-to-end', async () => {
    const alternate = SupplierItem.create({
      supplierId: supplier.id,
      ingredientId: ingredient.id,
      purchaseUnit: '10 kg Box',
      purchaseUnitQty: 10,
      purchaseUnitType: 'kg',
      unitPrice: 80,
      isPreferred: false,
    });
    alternate.costPerBaseUnit = alternate.computeCostPerBaseUnit(ingredient);
    const altSaved = await supplierItems.save(alternate);

    const lineRepo = dataSource.getRepository(RecipeIngredient);
    const line = await lineRepo.findOneByOrFail({ recipeId: recipe.id });
    line.sourceOverrideRef = altSaved.id;
    await lineRepo.save(line);

    const breakdown = await cost.computeRecipeCost(org.id, recipe.id);
    // Alternate: 80/10000 = 0.008 €/g; 500 × 0.008 = 4
    expect(breakdown.totalCost).toBe(4);
    expect(breakdown.components[0].sourceRefId).toBe(altSaved.id);
  });

  it('supports computeCostDelta with two sequential snapshots', async () => {
    const t0 = new Date(Date.now() - 1000);
    await cost.recordSnapshot(org.id, recipe.id, 'INITIAL');
    // Bump price.
    preferred.unitPrice = 50;
    preferred.costPerBaseUnit = preferred.computeCostPerBaseUnit(ingredient);
    await supplierItems.save(preferred);
    await cost.recordSnapshot(org.id, recipe.id, 'SUPPLIER_PRICE_CHANGE');
    const t1 = new Date(Date.now() + 1000);

    const delta = await cost.computeCostDelta(org.id, recipe.id, t0, t1);
    expect(delta.totalDelta).toBeGreaterThan(0);
    expect(delta.components.length).toBeGreaterThan(0);
    void auditLog;
  });
});
