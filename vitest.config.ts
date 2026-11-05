import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: '.temp/vitest-unit',
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`. Requires Vite 8, which ships this option.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    setupFiles: ['./test/setup-env.ts'],
    root: './',
    include: ['**/*.spec.ts'],
    exclude: ['node_modules/**', 'dist/**', 'src/generated/**'],
  },
});
