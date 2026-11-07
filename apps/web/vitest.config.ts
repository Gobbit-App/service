import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [react()],
  define: {
    __APP_COMMIT__: JSON.stringify('0123456789abcdef0123456789abcdef01234567'),
    __APP_BUILT_AT__: JSON.stringify('2026-11-06T09:30:00.000Z'),
  },
  test: {
    name: 'web',
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
