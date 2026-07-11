import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    // Output into the panel/dist/ folder — the deployable artifact
    outDir: resolve(__dirname, '../panel/dist'),
    emptyOutDir: true,

    // Target Chrome 80 (oldest CEF in supported Premiere Pro versions)
    target: 'chrome80',

    // Build as a self-executing IIFE — no ES modules, no dynamic imports
    lib: {
      entry: resolve(__dirname, 'src/main.tsx'),
      name: 'FreeXanCaption',
      formats: ['iife'],
      fileName: () => 'freexan-caption.js',
    },

    rollupOptions: {
      output: {
        // Single CSS file alongside the JS
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'freexan-caption.css';
          }
          return assetInfo.name || 'assets/[name]-[hash][extname]';
        },
      },
    },

    // Keep bundle readable during development — switch to true for release
    minify: false,
    sourcemap: true,
  },

  // Dev server config — used with panel.dev.html pointing to localhost:5173
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
});
