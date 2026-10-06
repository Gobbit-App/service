import { defineConfig, devices } from '@playwright/test';
import { resolveE2eEnv } from './lib/env';

const { baseURL, token } = resolveE2eEnv();

/** Specs that drive the browser against the web origin (D62); the rest are API-only. */
const WEB_SPECS = /\/(web|share)\.spec\.ts$/;

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
      testIgnore: WEB_SPECS,
    },
    {
      // D62: Chromium at a Pixel 7 viewport. The browser authenticates with the session cookie
      // only (fixtures/web.ts); API setup calls get the bearer header from the `api` fixture.
      name: 'web-smoke',
      use: { ...devices['Pixel 7'], baseURL: `${baseURL}/` },
      testMatch: WEB_SPECS,
    },
  ],
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 15000,
});
