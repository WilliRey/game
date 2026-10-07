import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages serves this repo at /game/, so the production base must match.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/game/' : '/',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  server: { port: 5173, strictPort: true, host: true },
  preview: { port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
}));
