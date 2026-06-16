import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  // Never wipe dist in watch mode — consumers' tsc watchers resolve types
  // from dist and a wipe races their first compile.
  clean: !options.watch,
  external: ['@mvs/shared'],
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
}));
