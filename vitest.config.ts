import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.d.ts', 'src/mainview/**', 'src/test/**', 'src/global.d.ts'],
      thresholds: {
        statements: 50,
        branches: 40,
        functions: 40,
        lines: 50
      }
    }
  }
})
