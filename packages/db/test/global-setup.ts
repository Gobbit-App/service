import type { TestProject } from 'vitest/node';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { runMigrations } from '../src/migrations';

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUrl: string;
    pgTemplateDb: string;
  }
}

export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg17').start();
  const startTime = new Date();
  console.log(`PostgreSQL container started at ${startTime.toISOString()}`);

  const adminUrl = container.getConnectionUri();
  const adminPool = new pg.Pool({ connectionString: adminUrl });

  try {
    // Create template database
    const adminClient = await adminPool.connect();
    try {
      await adminClient.query('CREATE DATABASE template_pb');
    } finally {
      adminClient.release();
    }

    // Run migrations on template database
    const templateUrl = new URL(adminUrl);
    templateUrl.pathname = '/template_pb';
    const templatePool = new pg.Pool({ connectionString: templateUrl.toString() });
    try {
      await runMigrations(templatePool);
    } finally {
      await templatePool.end();
    }

    // Provide context
    project.provide('pgAdminUrl', adminUrl);
    project.provide('pgTemplateDb', 'template_pb');

    // Return teardown
    return async () => {
      await adminPool.end();
      await container.stop();
    };
  } catch (error) {
    await adminPool.end();
    await container.stop();
    throw error;
  }
}
