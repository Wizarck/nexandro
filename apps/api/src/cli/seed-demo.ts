// CLI entry — idempotent demo seed for fase de prueba.
//
// Called by apps/api/scripts/migrate-and-start.sh when env DEMO_MODE=true.
// Creates ONE organization + ONE OWNER user + seeds default category taxonomy.
// Uses FIXED UUIDs so the SPA (baked with VITE_DEMO_ORG_ID at build time) can
// reference the seed without runtime config.
//
// Re-running is safe: INSERT ... ON CONFLICT DO NOTHING + a transactional
// category seed that no-ops on existing rows.

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { buildDataSourceOptions } from '../database-options';
import { Organization } from '../iam/domain/organization.entity';
import { User } from '../iam/domain/user.entity';
import { seedDefaultCategories } from '../ingredients/infrastructure/category-seed';

// Stable UUIDs — must match VITE_DEMO_ORG_ID + VITE_DEMO_USER_ID build args in Dockerfile.
export const DEMO_ORG_ID = '00000000-0000-4000-8000-000000000001';
export const DEMO_OWNER_USER_ID = '00000000-0000-4000-8000-000000000002';
const DEMO_OWNER_EMAIL = 'demo@nexandro.local';
const DEMO_OWNER_PASSWORD_PLAIN = 'demo'; // not a real credential — DemoAuthMiddleware bypasses password check

async function run(): Promise<void> {
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();
  try {
    await dataSource.transaction(async (em) => {
      // 1. Organization
      const orgRepo = em.getRepository(Organization);
      const existingOrg = await orgRepo.findOne({ where: { id: DEMO_ORG_ID } });
      if (!existingOrg) {
        await em.query(
          `INSERT INTO organizations (id, name, currency_code, default_locale, timezone, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [DEMO_ORG_ID, 'Nexandro Demo', 'EUR', 'es', 'Europe/Madrid'],
        );
        console.log(`seed-demo: created organization ${DEMO_ORG_ID}`);
      } else {
        console.log(`seed-demo: organization ${DEMO_ORG_ID} already exists`);
      }

      // 2. Owner user
      const userRepo = em.getRepository(User);
      const existingUser = await userRepo.findOne({ where: { id: DEMO_OWNER_USER_ID } });
      if (!existingUser) {
        const passwordHash = await bcrypt.hash(DEMO_OWNER_PASSWORD_PLAIN, 12);
        await em.query(
          `INSERT INTO users (id, organization_id, name, email, password_hash, role, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [
            DEMO_OWNER_USER_ID,
            DEMO_ORG_ID,
            'Demo Owner',
            DEMO_OWNER_EMAIL,
            passwordHash,
            'OWNER',
          ],
        );
        console.log(`seed-demo: created OWNER user ${DEMO_OWNER_USER_ID}`);
      } else {
        console.log(`seed-demo: user ${DEMO_OWNER_USER_ID} already exists`);
      }

      // 3. Default category taxonomy (idempotent — repository helper handles dups).
      const seeded = await seedDefaultCategories(em, DEMO_ORG_ID, { actorUserId: DEMO_OWNER_USER_ID });
      console.log(`seed-demo: seeded ${seeded} default categories`);
    });
  } finally {
    await dataSource.destroy();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('seed-demo: FAILED', err);
    process.exit(1);
  });
