import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'app'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['unit-tests/**/*.test.ts', 'unit-tests/**/*.test.tsx'],
    exclude: ['coverage/**', 'dist/**', 'build/**', 'node_modules/**'],
  },
});
