import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.png', 'og/*.png'],
      manifest: {
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
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['og/**'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/s\//, /^\/version\.json$/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/res\.cloudinary\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cloudinary-images',
              expiration: { maxEntries: 300, maxAgeSeconds: THIRTY_DAYS },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    manifest: true,
    target: 'es2022',
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
    },
  },
});
