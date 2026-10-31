import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const appPort = process.env.E2E_APP_PORT ?? '4173';
const apiPort = process.env.E2E_API_PORT ?? '8081';
const appUrl = `http://localhost:${appPort}`;
const apiUrl = `http://localhost:${apiPort}/api`;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: appUrl,
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      testIgnore: /global\.setup\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node e2e/start-backend.mjs',
      url: `http://localhost:${apiPort}/api/users`,
      timeout: 180_000,
      reuseExistingServer: !isCI,
      env: {
        E2E_API_PORT: apiPort,
      },
    },
    {
      command: `npm run dev -- --port ${appPort} --strictPort`,
      url: appUrl,
      timeout: 120_000,
      reuseExistingServer: !isCI,
      env: {
        VITE_API_BASE_URL: apiUrl,
        VITE_WS_BASE_URL: `http://localhost:${apiPort}/api/ws`,
        VITE_RTC_STUN_URLS: '',
      },
    },
  ],
});
