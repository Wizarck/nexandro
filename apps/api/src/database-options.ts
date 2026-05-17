import 'reflect-metadata';
import { DataSourceOptions } from 'typeorm';

/**
 * Single source of truth for the runtime DataSource configuration.
 *
 * Consumed in two places that MUST stay in sync:
 * 1. `apps/api/src/app.module.ts` — `TypeOrmModule.forRootAsync({ useFactory: buildDataSourceOptions })`.
 * 2. `apps/api/src/data-source.ts` — the migrations CLI entry that
 *    `typeorm-ts-node-commonjs migration:*` invokes via `package.json` scripts.
 *
 * Both consumers read `DATABASE_URL` and inherit the same entity / migration
 * globs, so a config drift between the runtime DataSource and the CLI is
 * structurally impossible.
 */
export function buildDataSourceOptions(): DataSourceOptions {
  return {
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [`${__dirname}/**/domain/*.entity.{ts,js}`],
    migrations: [`${__dirname}/migrations/*.{ts,js}`],
    migrationsTableName: 'nexandro_migrations',
    synchronize: false,
    logging: process.env.TYPEORM_LOGGING === 'true',
  };
}
