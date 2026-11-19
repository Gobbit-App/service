import { defineConfig, devices } from '@playwright/test';
import { webUrl } from './lib/stack';

// Run through `pnpm test:e2e` (run.ts), which brings the isolated stack up and writes the stack file.
export default defineConfig({
  testDir: './tests',
  use: { ...devices['Pixel 7'], baseURL: webUrl('/'), trace: 'retain-on-failure' },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 15000,
});
