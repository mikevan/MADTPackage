import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The gate builds real TypeScript programs over four packages. That is
    // slower than a unit test and slow is the correct trade: a release gate
    // runs once per release, and reading the real program is what makes it
    // structural rather than textual.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
