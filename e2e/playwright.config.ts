import { defineConfig } from '@playwright/test';

const token = process.env.DEV_API_TOKEN ?? '';
const user = process.env.DEV_USER ?? 'dev@example.test';
const baseURL = process.env.BASE_URL ?? 'http://localhost:3000';

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
