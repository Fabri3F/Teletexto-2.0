import { defineConfig, devices } from '@playwright/test';

// Pruebas de extremo a extremo (Playwright). Se escriben junto al módulo que prueban,
// con el sufijo *.e2e.ts, y se ejecutan contra la compilación servida con `vite preview`.
// Los navegadores se descargan una sola vez con: npx playwright install chromium
export default defineConfig({
  testDir: 'apps/web',
  testMatch: '**/*.e2e.ts',
  testIgnore: '**/node_modules/**',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    locale: 'es-PE',
    timezoneId: 'America/Lima',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    { name: 'movil-320', use: { ...devices['Pixel 5'], viewport: { width: 320, height: 640 } } },
  ],
  webServer: {
    command: 'npm run build && npm run preview --workspace @teletexto/web -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
