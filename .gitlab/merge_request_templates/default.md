Title format: `type(scope): summary`, in English.

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

## Summary

-

## Motivation

-

## Implementation Notes

-

## Validation

- [ ] Repository checks: `gh repo-checks repository`
- [ ] MR title: `gh repo-checks pr-title "<title>"`
- [ ] MR description: `gh repo-checks pr-body <body-file>`
- [ ] Install: `pnpm install --frozen-lockfile`
- [ ] Format: `pnpm format:check`
- [ ] MoonBit version: `pnpm check:moonbit-version`
- [ ] Test: `pnpm test`
- [ ] Build: `pnpm build`
- [ ] Typecheck: `pnpm typecheck`
- [ ] Lint: `pnpm lint` (after build and typecheck)
- [ ] Changeset: `pnpm changeset status` (package-facing changes add a changeset)
- [ ] Package dry-run: `npm pack --dry-run --registry=https://registry.npmjs.org` in each changed published package

Skipped gates and reasons:

-

## Evidence

- Requirement and paired Spec/Plan:
- Logs, screenshots, package output, or deployed artifact:
- Reviewer notes that changed the final scope:

## Safety Checklist

- [ ] No credentials, tokens, private hostnames, personal filesystem paths, or generated logs are included.
- [ ] Local config, generated output, build artifacts, and temporary workspaces are not staged.
- [ ] User-facing behavior, docs, release change files, migrations, or rollback notes are updated when relevant.
- [ ] Completed Spec/Plan constraints are migrated to tests or current-state docs before retirement; unfinished scope remains active.
- [ ] The branch is current enough for review, and the remote head matches the intended commit.

## Follow-up Risks

-
