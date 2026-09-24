import { defineConfig } from '@playwright/test';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
// Inherited by the web server and workers; each invocation owns a unique directory.
process.env.AMP_BROWSER_MATERIAL_DIR ??= resolve(
  'output/playwright/audio-' + randomUUID(),
);
export default defineConfig({
  globalTeardown: './tests/browser/cleanup.mjs',
  testDir: './tests/browser',
  testMatch: '**/*.spec.mjs',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'output/playwright/report', open: 'never' }],
  ],
  outputDir: 'output/playwright/results',
  use: {
    baseURL: 'http://127.0.0.1:3299',
    headless: true,
    launchOptions: { args: ['--mute-audio', '--enable-automation'] },
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node tests/browser/server.mjs',
    url: 'http://127.0.0.1:3299/api/health',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
