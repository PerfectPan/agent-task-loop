import { fmt } from '@perfectpan/lint-config/vite-plus';

export default {
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
};
