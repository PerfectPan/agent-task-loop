# agent-finder-cli

Command-line interface for local coding-agent discovery and session browsing.

```bash
agent-finder scan
agent-finder scan --json
agent-finder provider -h
agent-finder provider list
agent-finder provider inspect codex
agent-finder doctor
agent-finder sessions
agent-finder sessions list --json
agent-finder sessions inspect <id>
agent-finder sessions resume <id>
```

Detection, session listing, and provider metadata come from `@rivus/agent-kit` (`@rivus/agent-kit/catalog`, `/discovery`, `/sessions`, `/transcript`): nine built-in discovery recipes, plus 20 probe recipes the CLI ships for the other catalog agents.

## License

MIT. See [LICENSE](LICENSE). Other packages in this repository have their own licenses; see the [root README](../../README.md#license).
