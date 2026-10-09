import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: null,
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
        manifest: {
          id: '/',
          name: 'ROADLIVE — Живая карта дорожной обстановки',
          short_name: 'ROADLIVE',
          description: 'Живая карта дорожной обстановки: ДТП, переезды, дорожный контроль, АЗС и вопросы водителей в реальном времени.',
          theme_color: '#1d4ed8',
          background_color: '#f8fafc',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          importScripts: ['/sw-push.js'],
          // index.html is intentionally NOT precached: the browser must always
          // fetch a fresh shell (NetworkFirst below), otherwise the Service
          // Worker keeps serving the previous build after every deploy.
          globPatterns: ['**/*.{js,css,ico,png,svg,woff,woff2}'],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              // App shell: always revalidate against the network so new builds
              // land on the first open; fall back to the last good copy offline.
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'roadlive-pages',
                networkTimeoutSeconds: 4,
                expiration: {
                  maxEntries: 1,
                  maxAgeSeconds: 60 * 60 * 24,
                },
              },
            },
            {
              // Yandex Maps raster tiles: without this every pan re-downloads
              // the whole viewport and leaves grey gaps on slow networks.
              urlPattern: /^https:\/\/[^/]+\.maps\.yandex\.(net|ru)\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'yandex-map-tiles',
                expiration: {
                  maxEntries: 1200,
                  maxAgeSeconds: 60 * 60 * 24 * 14,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              // Maps JS API and its assets: revalidate so API updates still land.
              urlPattern: /^https:\/\/(api-maps\.yandex\.ru|yastatic\.net)\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'yandex-maps-assets',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

