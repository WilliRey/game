import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // CI machines have no GPU: opt in to SwiftShader explicitly (Chrome deprecated the silent fallback).
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/game/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  outputDir: 'e2e/.results',
});
