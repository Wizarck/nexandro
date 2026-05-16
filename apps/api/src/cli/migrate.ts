// CLI entry — applies all pending TypeORM migrations against DATABASE_URL.
// m3.x-app-bootstrap-and-vps-deploy slice §1.8 + ADR-MIGRATE-THEN-START-SCRIPT.
//
// Invoked by apps/api/scripts/migrate-and-start.sh as the first step of
// container startup. Exits 0 on success, 1 on any failure.
//
// Reuses buildDataSourceOptions() so the migration set is identical to
// what the runtime DataSource would apply.

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../database-options';

async function run(): Promise<void> {
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();
  try {
    const applied = await dataSource.runMigrations();
    if (applied.length === 0) {
      console.log('migrate: no pending migrations.');
    } else {
      console.log(`migrate: applied ${applied.length} migration(s):`);
      for (const m of applied) {
        console.log(`  - ${m.name}`);
      }
    }
  } finally {
    await dataSource.destroy();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('migrate: FAILED', err);
    process.exit(1);
  });
