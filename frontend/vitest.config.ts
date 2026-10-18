import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom',
    clearMocks: true,
    restoreMocks: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      /**
       * Minimums sit just below the current suite (44/28/38/50) so the gate
       * catches meaningful regressions without blocking isolated refactors.
       */
      thresholds: {
        statements: 40,
        branches: 25,
        functions: 34,
        lines: 45,
      },
    },
  },
}));
