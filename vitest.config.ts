import { defineConfig } from 'vitest/config';

// Pruebas unitarias y de propiedades (Vitest + fast-check) de todo el monorepo.
// Las pruebas de extremo a extremo (*.e2e.ts) las ejecuta Playwright, no Vitest.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      '*.test.ts',
      'apps/**/*.test.{ts,tsx}',
      'packages/**/*.test.ts',
      'tools/**/*.test.ts',
      'workers/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/dist.tmp/**', '**/*.e2e.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
