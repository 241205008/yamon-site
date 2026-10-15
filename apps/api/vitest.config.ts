import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // PGlite（WebAssembly）の起動に数秒かかることがある
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
