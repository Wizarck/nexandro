import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './database-options';

export default new DataSource(buildDataSourceOptions());
