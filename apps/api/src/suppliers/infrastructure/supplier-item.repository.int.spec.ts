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
import { Supplier } from '../domain/supplier.entity';
import { SupplierItem } from '../domain/supplier-item.entity';
import { SupplierRepository } from './supplier.repository';
import { SupplierItemRepository } from './supplier-item.repository';

const ALL_ENTITIES = [Organization, User, Location, UserLocation, Category, Ingredient, Supplier, SupplierItem];

describe('SupplierItemRepository (integration)', () => {
  let app: TestingModule;
  let dataSource: DataSource;
  let supplierItems: SupplierItemRepository;
  let suppliers: SupplierRepository;
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
        SupplierRepository,
        SupplierItemRepository,
      ],
    }).compile();

    dataSource = app.get(DataSource);
    supplierItems = app.get(SupplierItemRepository);
    suppliers = app.get(SupplierRepository);
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
  let supA: Supplier;
  let supB: Supplier;
  let ing: Ingredient;
  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "supplier_items", "suppliers", "ingredients", "categories", "user_locations", "users", "locations", "organizations" RESTART IDENTITY CASCADE',
    );
    org = await organizations.save(
      Organization.create({ name: 'Acme', currencyCode: 'EUR', defaultLocale: 'es', timezone: 'Europe/Madrid' }),
    );
    const cat = await categories.save(
      Category.create({ organizationId: org.id, parentId: null, name: 'food', nameEs: 'Food', nameEn: 'Food' }),
    );
    ing = await ingredients.save(
      Ingredient.create({ organizationId: org.id, categoryId: cat.id, name: 'Tomate', baseUnitType: 'WEIGHT' }),
    );
    supA = await suppliers.save(
      Supplier.create({ organizationId: org.id, name: 'Supplier A', country: 'ES' }),
    );
    supB = await suppliers.save(
      Supplier.create({ organizationId: org.id, name: 'Supplier B', country: 'ES' }),
    );
  });

  it('partial unique index forbids two preferred SupplierItems for one ingredient', async () => {
    await supplierItems.save(
      SupplierItem.create({
        supplierId: supA.id,
        ingredientId: ing.id,
        purchaseUnit: '5 kg Box',
        purchaseUnitQty: 5,
        purchaseUnitType: 'kg',
        unitPrice: 25,
        isPreferred: true,
      }),
    );
    await expect(
      supplierItems.save(
        SupplierItem.create({
          supplierId: supB.id,
          ingredientId: ing.id,
          purchaseUnit: '10 kg Sack',
          purchaseUnitQty: 10,
          purchaseUnitType: 'kg',
          unitPrice: 45,
          isPreferred: true,
        }),
      ),
    ).rejects.toBeInstanceOf(QueryFailedError);
  });

  it('promoteToPreferred atomically demotes the previous preferred', async () => {
    const a = await supplierItems.save(
      SupplierItem.create({
        supplierId: supA.id,
        ingredientId: ing.id,
        purchaseUnit: '5 kg Box',
        purchaseUnitQty: 5,
        purchaseUnitType: 'kg',
        unitPrice: 25,
        isPreferred: true,
      }),
    );
    const b = await supplierItems.save(
      SupplierItem.create({
        supplierId: supB.id,
        ingredientId: ing.id,
        purchaseUnit: '10 kg Sack',
        purchaseUnitQty: 10,
        purchaseUnitType: 'kg',
        unitPrice: 45,
        isPreferred: false,
      }),
    );

    await supplierItems.promoteToPreferred(b.id);

    const reloaded = await supplierItems.findByIngredient(ing.id);
    const map = new Map(reloaded.map((r) => [r.id, r]));
    expect(map.get(a.id)?.isPreferred).toBe(false);
    expect(map.get(b.id)?.isPreferred).toBe(true);
  });

  it('cost_per_base_unit numeric(14,4) round-trips at 4 decimals', async () => {
    const si = SupplierItem.create({
      supplierId: supA.id,
      ingredientId: ing.id,
      purchaseUnit: '3 kg',
      purchaseUnitQty: 3,
      purchaseUnitType: 'kg',
      unitPrice: 17,
    });
    si.costPerBaseUnit = si.computeCostPerBaseUnit(ing);
    const saved = await supplierItems.save(si);
    const reloaded = await supplierItems.findOneBy({ id: saved.id });
    // Numeric serialised as string by pg driver; normalise to number for comparison.
    expect(Number(reloaded?.costPerBaseUnit)).toBe(0.0057);
  });
});
