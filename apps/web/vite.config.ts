import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  define: {
    __APP_COMMIT__: JSON.stringify(process.env.GIT_SHA ?? 'dev'),
  },
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        id: '/',
        name: 'Gobbit',
        short_name: 'Gobbit',
        description: "Your family's pocket of useful cards",
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#b4532a',
        background_color: '#fbf6ef',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // D98: Android's share sheet POSTs here; the SW stashes it and opens the confirm screen.
        share_target: {
          action: '/share',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{ name: 'files', accept: ['image/*'] }],
          },
        },
      },
      // D98: the SW (`src/sw.ts`) owns the runtime rules; only the precache list is configured here.
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['og/**'],
      },
    }),
  ],
  build: {
    manifest: true,
    target: 'es2022',
    // The lazy calc chunk carries mathjs (~180 KB gzip, D57); the initial budget is checked by `pnpm budget`.
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '^/api/.*': {
        target: API_TARGET,
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '^/s/.*': { target: API_TARGET, changeOrigin: false },
      // D177: public pages, sitemap and robots.txt are API-rendered (Caddy does the same).
      '^/(p/.*|sitemap\\.xml|robots\\.txt)$': { target: API_TARGET, changeOrigin: false },
    },
  },
});
