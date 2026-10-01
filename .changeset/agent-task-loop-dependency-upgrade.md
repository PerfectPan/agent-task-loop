---
'@rivus/agent-task-loop': minor
---

Upgrade the runtime dependencies to Zod 4, Ink 7 with React 19, execa 10, and citty 0.2. User-visible changes:

- Node.js 22 or newer is required; Node.js 20 is no longer supported.
- A value after a boolean flag is rejected: `cleanup --force false` used to turn `--force` off, but citty 0.2 never reads a value for a boolean flag and would turn it on. Turn a flag off with `--no-force` or `--force=false`. Every command also rejects other positional arguments it does not take.
- `--max-rounds` on `start` and `reject` now takes effect; it used to be ignored in favour of the default of 5 unless written `--maxRounds`.
- `-v` prints the version, and `--help` output uses citty 0.2's layout.
- A failing command prints its error message and the message of each error that caused it, instead of the whole error object.
- Validation errors from `create`, `source add` and config loading use Zod 4's wording, for example `Invalid --priority: Too big: expected number to be <=9`.
- The `./rivus-plugin` tools report a field missing from their input as `is required`, for example `Invalid task-create title: is required`, instead of `has an invalid type`.
