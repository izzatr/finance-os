import { defineConfig } from 'vitest/config'

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://finance:finance@localhost:27033/finance_os_test'

export default defineConfig({
  test: {
    globalSetup: './src/test/global-setup.ts',
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      BETTER_AUTH_SECRET: 'test-secret-for-tests-only-min-32-chars',
      BETTER_AUTH_URL: 'http://localhost:27032',
      WEB_ORIGIN: 'http://localhost:27031',
      STRIPE_SECRET_KEY: 'sk_test_00000000000000000000000000000000',
    },
    fileParallelism: false,
    testTimeout: 15000,
  },
})
