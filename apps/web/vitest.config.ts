import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Pure-logic unit tests (board view transforms, etc.). Node env — no DOM needed;
// the `@/` alias mirrors tsconfig so imports match the app.
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
