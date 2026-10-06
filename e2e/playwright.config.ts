import { defineConfig } from '@playwright/test';
import { resolveE2eEnv } from './lib/env';

const { baseURL, token } = resolveE2eEnv();

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  projects: [
    {
      name: 'api-smoke',
      use: {
        // Trailing slash + relative request paths (`decks`, not `/decks`): Playwright resolves
        // paths with `new URL(path, baseURL)`, so a leading slash would drop the `/api` prefix
        // of the deployed base URL (D46).
        baseURL: `${baseURL}/`,
        // D43: the owner's seeded smoke session; `anon` fixture requests carry no credentials.
        extraHTTPHeaders: token ? { Authorization: `Bearer ${token}` } : {},
      },
    },
  ],
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 15000,
});
