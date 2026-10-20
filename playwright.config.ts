import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const folder = mkdtempSync(join(tmpdir(), 'na-browser-'));
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: 'http://127.0.0.1:3011',
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      args: ['--no-sandbox'],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  outputDir: '/tmp/na-playwright-results',
  reporter: 'list',
  webServer: {
    command: 'npm run start -w backend',
    url: 'http://127.0.0.1:3011/api/health',
    reuseExistingServer: false,
    env: {
      PORT: '3011',
      SETUP_TOKEN: 'Browser-bootstrap-code-2026',
      DATABASE_PATH: join(folder, 'browser.sqlite'),
    },
    timeout: 30000,
  },
});
