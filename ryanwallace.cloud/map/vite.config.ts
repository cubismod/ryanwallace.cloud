import { defineConfig } from 'vite'
import { resolve } from 'path'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        map: resolve(
          fileURLToPath(new URL('.', import.meta.url)),
          'src/index.html'
        ),
        track: resolve(
          fileURLToPath(new URL('.', import.meta.url)),
          'src/track.html'
        ),
        alerts: resolve(
          fileURLToPath(new URL('.', import.meta.url)),
          'src/alerts.html'
        ),
        sw: resolve(fileURLToPath(new URL('.', import.meta.url)), 'src/sw.ts')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'sw') {
            return 'sw.js'
          }
          return '[name].js'
        },
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name].[ext]',
        manualChunks: {
          leaflet: ['leaflet'],
          maptiler: ['@maptiler/leaflet-maptilersdk'],
          datatables: [
            'datatables.net',
            'datatables.net-dt',
            'datatables.net-responsive'
          ],
          vendor: ['dompurify', 'date-fns', 'date-fns-tz', '@date-fns/tz'],
          turf: [
            '@turf/along',
            '@turf/distance',
            '@turf/helpers',
            '@turf/length',
            '@turf/nearest-point-on-line'
          ]
        }
      }
    },
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_getters: true,
        passes: 2
      },
      mangle: true,
      format: {
        comments: false
      }
    },
    sourcemap: false,
    chunkSizeWarningLimit: 600
  },
  define: {
    global: 'globalThis'
  },
  envPrefix: [
    'VITE_',
    'MT_',
    'VEHICLES_',
    'MBTA_API_',
    'TRACK_PREDICTION_',
    'BOS_'
  ],
  resolve: {
    alias: {
      leaflet$: 'leaflet/dist/leaflet.js'
    }
  },
  server: {
    port: 3000,
    open: true
  },
  base: '/map/',
  optimizeDeps: {
    include: [
      'leaflet',
      'datatables.net',
      'datatables.net-dt',
      'datatables.net-responsive',
      'dompurify',
      '@turf/along',
      '@turf/distance',
      '@turf/helpers',
      '@turf/length',
      '@turf/nearest-point-on-line'
    ]
  }
})
