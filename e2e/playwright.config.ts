import { defineConfig } from '@playwright/test';
import { resolveE2eEnv } from './lib/env';

const { baseURL, token, user } = resolveE2eEnv();

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  projects: [
    {
      name: 'api-smoke',
      use: {
        baseURL,
        extraHTTPHeaders: {
          Authorization: `Bearer ${token}`,
          'X-Dev-User': user,
        },
      },
    },
  ],
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 15000,
});
