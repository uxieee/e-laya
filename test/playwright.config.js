import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  /* Runs after webServer is up. Refuses the run if the thing listening on
     127.0.0.1:5173 is not this repo's harness — see test/global-setup.js. */
  globalSetup: './global-setup.js',
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:5173/index.html',
    reuseExistingServer: true,
    timeout: 30000
  }
});
