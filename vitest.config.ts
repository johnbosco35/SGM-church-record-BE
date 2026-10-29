import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // One worker keeps a single in-memory MongoDB per file and avoids port races.
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } }
  }
});
