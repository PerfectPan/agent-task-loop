---
'@rivus/agent-finder-cli': patch
'@rivus/agent-task-loop': patch
---

Running the CLIs from source through the bin wrappers now pins the package's own `tsconfig.json` (`TSX_TSCONFIG_PATH`) instead of letting tsx discover one from the working directory. Invoked from a checkout root without a root tsconfig, tsx fell back to the classic JSX transform and the TUIs crashed with `React is not defined`.
