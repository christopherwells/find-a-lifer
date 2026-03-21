import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  workers: 3, // Limit concurrency — WebKit import tests are CPU-heavy
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  projects: [
    // Default: Chromium desktop (core regression tests only)
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
      testIgnore: /persona-/,
    },
    // Persona browsers/viewports
    {
      name: 'chromium-desktop',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
      },
      testMatch: /persona-/,
    },
    {
      name: 'webkit-mobile',
      use: {
        ...devices['iPhone 13'],
      },
      testMatch: /persona-/,
      timeout: 60000, // WebKit IndexedDB imports are inherently slower (~15s)
    },
    {
      name: 'chromium-mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
      testMatch: /persona-/,
    },
    {
      name: 'firefox-desktop',
      use: {
        browserName: 'firefox',
        viewport: { width: 1024, height: 768 },
      },
      testMatch: /persona-/,
    },
    {
      name: 'chromium-tablet',
      use: {
        browserName: 'chromium',
        viewport: { width: 768, height: 1024 },
        isMobile: true,
        hasTouch: true,
      },
      testMatch: /persona-/,
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 15000,
  },
})
