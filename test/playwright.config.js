import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:5173/index.html',
    reuseExistingServer: true,
    timeout: 30000
  }
});
