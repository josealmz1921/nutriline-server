import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: '.temp/vitest-integration',
  test: {
    globals: true,
    include: ['test/**/*.integration-spec.ts'],
    fileParallelism: false,
    hookTimeout: 30000,
  },
});
