import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    // Environment
    environment: 'happy-dom',

    // Setup files
    setupFiles: ['./test/setup.ts'],

    // Global test utilities
    globals: true,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/__tests__/**',
        '**/*.{test,spec}.{js,ts,jsx,tsx}',
        '**/mockData',
        'dist/',
        '.next/',
        'coverage/',
        'components/ui/**', // Shadcn components (tested via integration)
        'app/dev/**',
        'app/api/batch-scraper/**',
        'e2e/**',
      ],
      include: [
        'app/**/*.{ts,tsx}',
      ]
    },

    // Test file patterns
    include: [
      '**/__tests__/**/*.{test,spec}.{js,ts,jsx,tsx}',
      '**/*.{test,spec}.{js,ts,jsx,tsx}'
    ],

    // Exclude patterns
    exclude: [
      'node_modules',
      'dist',
      '.next',
      'coverage',
      '**/*.config.*',
      'e2e/**',         // Playwright E2E tests — run via `playwright test`, not vitest
    ],

    // Timeouts
    testTimeout: 10000,
    hookTimeout: 10000,

    // Concurrency
    threads: true,
    maxConcurrency: 5,

    // Watch mode
    watchExclude: ['**/node_modules/**', '**/dist/**', '**/.next/**']
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
