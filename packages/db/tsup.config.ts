import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  // Never wipe dist in watch mode — consumers' tsc watchers resolve types
  // from dist and a wipe races their first compile.
  clean: !options.watch,
  external: ['@prisma/client', '@mvs/shared', '.prisma/client'],
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
}));
