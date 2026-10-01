Title format: `type(scope): summary`, in English.

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

## Summary

<!-- What changed and why. Link the issue, Spec, or Plan when there is one. -->

-

## Validation

<!-- Commands you ran and their results; logs or screenshots for behavior claims. Name skipped checks and why. -->

- [ ] Repository checks: `gh repo-checks repository`
- [ ] MR title and description: `gh repo-checks pr-title "<title>"`, `gh repo-checks pr-body <body-file>`
- [ ] Install: `pnpm install --frozen-lockfile`
- [ ] Format: `pnpm format:check`
- [ ] MoonBit version: `pnpm check:moonbit-version`
- [ ] Test: `pnpm test`
- [ ] Build: `pnpm build`
- [ ] Typecheck: `pnpm typecheck`
- [ ] Lint: `pnpm lint` (after build and typecheck)
- [ ] Changeset: `pnpm changeset status` (package-facing changes add a changeset)
- [ ] Package dry-run: `npm pack --dry-run --registry=https://registry.npmjs.org` in each changed published package

## Risks

<!-- Optional: compatibility, rollout, rollback, or follow-up risks. Delete this section when there are none. -->

-
