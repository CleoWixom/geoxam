import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      // injectManifest: we supply our own SW with custom manifest routing
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: 'auto',

      // Workbox config for injectManifest mode
      injectManifest: {
        globPatterns: [
          '**/*.{js,css,html,png,svg,woff2}',
          '**/manifest*.json',
        ],
      },

      // PWA manifest — this is the BASE manifest served by vite-plugin-pwa
      // The SW overrides /manifest.json dynamically at runtime
      manifest: {
        name: 'GeoXam',
        short_name: 'GeoXam',
        description: 'Geo-tagged photo capture',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-real-72.png',   sizes: '72x72',   type: 'image/png' },
          { src: '/icons/icon-real-96.png',   sizes: '96x96',   type: 'image/png' },
          { src: '/icons/icon-real-128.png',  sizes: '128x128', type: 'image/png' },
          { src: '/icons/icon-real-144.png',  sizes: '144x144', type: 'image/png' },
          { src: '/icons/icon-real-152.png',  sizes: '152x152', type: 'image/png' },
          { src: '/icons/icon-real-192.png',  sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-real-384.png',  sizes: '384x384', type: 'image/png' },
          { src: '/icons/icon-real-512.png',  sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],

  resolve: {
    alias: {
      '@core': '/src/core',
      '@features': '/src/features',
      '@ui': '/src/ui',
    },
  },

  build: {
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          idb: ['idb'],
        },
      },
    },
  },
})
