import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  resolve: { alias: { '@shared': path.resolve(import.meta.dirname, 'shared') } },
  server: {
    port: 5173,
    // WK_API points the dev server at another API (e.g. a test library on another port).
    proxy: { '/api': process.env.WK_API ?? 'http://127.0.0.1:4310' },
  },
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
