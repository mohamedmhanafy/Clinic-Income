import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/global-setup.ts'],
    include: ['tests/**/*.test.ts'],
    // The suite shares one database and truncates it between tests, so files must not
    // run concurrently.
    fileParallelism: false,
    sequence: { concurrent: false },
    env: { NODE_ENV: 'test' },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
