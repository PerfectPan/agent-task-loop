import { fmt, lint } from '@perfectpan/lint-config/vite-plus';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    ...fmt,
    // Keep the quote and trailing-comma style most of the existing code uses.
    singleQuote: true,
    trailingComma: 'all',
    // Copied verbatim from the project template; keep them byte-identical so syncs stay a plain diff.
    ignorePatterns: [
      '.github/ISSUE_TEMPLATE/**',
      '.github/workflows/review.yml',
      'docs/specs/0000-template.md',
      'docs/specs/README.md',
      'docs/plans/0000-template.md',
      'docs/plans/README.md',
    ],
  },
  lint: {
    ...lint,
    ignorePatterns: [
      '**/dist/**',
      '**/_build/**',
      'packages/agent-finder/src/moonbit/**',
      'apps/web/.next/**',
      'apps/web/next-env.d.ts',
      'apps/room-web/build/**',
      'apps/room-web/.react-router/**',
      '**/tests/fixtures/**',
    ],
    rules: {
      ...lint.rules,
      // Vitest accepts a failure message as the second `expect` argument.
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
      // Off until the suites are migrated: 559 untyped `vi.fn()` mocks.
      'vitest/require-mock-type-parameters': 'off',
    },
    overrides: [
      ...lint.overrides,
      {
        // `expect(mock.method).toHaveBeenCalled()` references methods without calling them.
        files: ['**/tests/**', '**/*.test.ts', '**/*.test.tsx'],
        rules: { 'typescript/unbound-method': 'off' },
      },
      {
        // node:test registers tests through the returned promise; the runner awaits them.
        files: ['tests/**/*.test.mjs'],
        rules: { 'typescript/no-floating-promises': 'off' },
      },
      {
        // React Router route modules export ErrorBoundary, Layout or meta helpers next to the
        // route component, and shadcn/ui files export a family of components. oxlint ignores a
        // react/* rule in an override that does not list the react plugin.
        files: [
          'apps/room-web/app/routes/**/*.tsx',
          'apps/room-web/app/root.tsx',
          'apps/room-web/app/components/ui/**/*.tsx',
        ],
        plugins: ['react'],
        rules: { 'react/no-multi-comp': 'off' },
      },
    ],
  },
});
