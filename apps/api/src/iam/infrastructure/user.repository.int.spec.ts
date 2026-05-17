import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { Organization } from '../domain/organization.entity';
import { User } from '../domain/user.entity';
import { Location } from '../domain/location.entity';
import { UserLocation } from '../domain/user-location.entity';
import { OrganizationRepository } from './organization.repository';
import { UserRepository } from './user.repository';

const HASH = '$2b$12$KIXMHnFdTsHHBMmEJYRzKePQGyDOuxF7vSj.O5kmaYxLHJyxeBoAi';

describe('UserRepository (integration)', () => {
  let app: TestingModule;
  let dataSource: DataSource;
  let users: UserRepository;
  let organizations: OrganizationRepository;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url:
            process.env.DATABASE_URL ??
            'postgres://nexandro_test:nexandro_test@localhost:5433/nexandro_test',
          entities: [Organization, User, Location, UserLocation],
          migrations: [`${__dirname}/../../migrations/*.{ts,js}`],
          migrationsTableName: 'nexandro_migrations',
          synchronize: false,
        }),
        TypeOrmModule.forFeature([Organization, User, Location, UserLocation]),
      ],
      providers: [OrganizationRepository, UserRepository],
    }).compile();

    dataSource = app.get(DataSource);
    users = app.get(UserRepository);
    organizations = app.get(OrganizationRepository);
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await app?.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "user_locations", "users", "locations", "organizations" RESTART IDENTITY CASCADE',
    );
  });

  async function seedOrg(name: string): Promise<Organization> {
    return organizations.save(
      Organization.create({ name, currencyCode: 'EUR', defaultLocale: 'es', timezone: 'Europe/Madrid' }),
    );
  }

  it('email is unique within an organization', async () => {
    const org = await seedOrg('Acme');
    const u1 = User.create({
      organizationId: org.id,
      name: 'Lourdes',
      email: 'l@example.com',
      passwordHash: HASH,
      role: 'MANAGER',
    });
    await users.save(u1);

    const u2 = User.create({
      organizationId: org.id,
      name: 'Lourdes II',
      email: 'l@example.com',
      passwordHash: HASH,
      role: 'STAFF',
    });

    await expect(users.save(u2)).rejects.toBeInstanceOf(QueryFailedError);
  });

  it('same email is allowed across different organizations', async () => {
    const orgA = await seedOrg('Acme A');
    const orgB = await seedOrg('Acme B');
    await users.save(
      User.create({
        organizationId: orgA.id,
        name: 'L',
        email: 'l@example.com',
        passwordHash: HASH,
        role: 'OWNER',
      }),
    );
    await expect(
      users.save(
        User.create({
          organizationId: orgB.id,
          name: 'L',
          email: 'l@example.com',
          passwordHash: HASH,
          role: 'OWNER',
        }),
      ),
    ).resolves.toBeDefined();
  });

  it('findByEmailAndOrg returns the right user', async () => {
    const org = await seedOrg('Acme');
    await users.save(
      User.create({
        organizationId: org.id,
        name: 'L',
        email: 'L@Example.COM',
        passwordHash: HASH,
        role: 'OWNER',
      }),
    );

    const found = await users.findByEmailAndOrg('l@example.com', org.id);
    expect(found?.email).toBe('l@example.com');
    expect(found?.role).toBe('OWNER');

    const notFound = await users.findByEmailAndOrg('no@example.com', org.id);
    expect(notFound).toBeNull();
  });

  it('cascades user delete on organization delete', async () => {
    const org = await seedOrg('Acme');
    await users.save(
      User.create({
        organizationId: org.id,
        name: 'L',
        email: 'l@example.com',
        passwordHash: HASH,
        role: 'OWNER',
      }),
    );

    await organizations.delete({ id: org.id });
    const remaining = await users.findByOrganization(org.id);
    expect(remaining).toHaveLength(0);
  });
});
