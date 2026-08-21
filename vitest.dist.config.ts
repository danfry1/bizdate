import path from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Runs the whole suite against the built artifact instead of `src/`, so a
 * packaging or bundling defect (a dropped export, a mangled entry) cannot pass
 * unnoticed.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    alias: [
      {
        // Every module under src/ resolves to the built entry point, so the
        // whole suite runs against the artifact that ships. `assert.ts` is
        // internal and not exported from the entry, so it stays on source.
        find: /^\.\.\/src\/(?!assert\.js$).*$/,
        replacement: path.resolve(import.meta.dirname, 'dist/index.mjs'),
      },
    ],
  },
})
