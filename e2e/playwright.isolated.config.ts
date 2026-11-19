import { defineConfig, devices } from '@playwright/test';
import { CONVERTED_SPECS } from './converted-specs';
import { webUrl } from './lib/stack';

export default defineConfig({
  testDir: './tests',
  // An empty testMatch would match every file; this pattern matches none.
  testMatch: CONVERTED_SPECS.length ? CONVERTED_SPECS : /(?!)/,
  use: { ...devices['Pixel 7'], baseURL: webUrl('/'), trace: 'retain-on-failure' },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 15000,
});
