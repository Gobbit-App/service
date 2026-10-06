import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const globalSetupPath = fileURLToPath(
  new URL('./packages/db/test/global-setup.ts', import.meta.url),
);

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['{apps,packages,e2e}/**/*.test.ts'],
          exclude: ['**/*.int.test.ts', '**/node_modules/**', 'apps/web/src/**'],
          environment: 'node',
        },
      },
      'apps/web/vitest.config.ts',
      {
        test: {
          name: 'integration',
          include: ['{apps,packages}/**/*.int.test.ts'],
          exclude: ['**/node_modules/**'],
          environment: 'node',
          globalSetup: [globalSetupPath],
          pool: 'forks',
          fileParallelism: false,
          testTimeout: 30000,
          hookTimeout: 120000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/shared/src/**', 'apps/api/src/**', 'apps/web/src/**'],
      exclude: [
        '**/*.test.{ts,tsx}',
        'apps/api/src/server.ts',
        'apps/web/src/main.tsx',
        'apps/web/src/routeTree.gen.ts',
        'apps/web/src/test/**',
      ],
      thresholds: {
        'packages/shared/src/**': { lines: 90 },
        'apps/api/src/**': { lines: 80 },
        'apps/web/src/**': { lines: 70 },
      },
    },
  },
});
