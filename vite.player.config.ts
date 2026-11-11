import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/** Static Player Handbook build (published to GitHub Pages or any static host). */
export default defineConfig({
  root: 'client/player-site',
  base: './',
  plugins: [react()],
  css: { postcss: path.resolve(import.meta.dirname, 'postcss.config.js') },
  resolve: { alias: { '@shared': path.resolve(import.meta.dirname, 'shared') } },
  build: { outDir: path.resolve(import.meta.dirname, 'dist-player'), emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
