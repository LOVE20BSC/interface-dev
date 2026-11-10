import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_PATH = process.env.E2E_BASE_PATH ?? '/';
const ORIGIN = `http://127.0.0.1:${PORT}`;

/**
 * E2E runs the production build through `vite preview`, never the dev server
 * (ADR-0001 §3.4). Set E2E_BASE_PATH=/repo/ to exercise a project-pages build.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: process.env.CI === 'true',
  retries: process.env.CI === 'true' ? 2 : 0,
  ...(process.env.CI === 'true' ? { workers: 1 } : {}),
  reporter: process.env.CI === 'true' ? 'github' : 'list',
  use: {
    baseURL: `${ORIGIN}${BASE_PATH}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT}`,
    url: `${ORIGIN}${BASE_PATH}`,
    reuseExistingServer: process.env.CI !== 'true',
    timeout: 180_000,
    env: {
      VITE_BASE: BASE_PATH,
    },
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
