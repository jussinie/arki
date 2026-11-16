import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['supabase/tests/init.test.ts'],
    testTimeout: 10_000,
  },
});
