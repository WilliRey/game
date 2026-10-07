import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages serves this repo at /game/, so the production base must match.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/game/' : '/',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Vite 8 transforms with Oxc; JSX goes through Preact's automatic runtime.
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  server: { port: 5173, strictPort: true, host: true },
  preview: { port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
}));
