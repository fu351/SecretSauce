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
        '**/mockData',
        'dist/',
        '.next/',
        'components/ui/**', // Shadcn components (tested via integration)
        'app/**', // Pages/routes (tested via E2E)
      ],
      include: [
        'hooks/**/*.ts',
        'lib/**/*.ts',
        'components/**/*.tsx'
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
      '**/*.config.*'
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
