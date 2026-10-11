# agent-finder-cli

Command-line interface for local code agent discovery.

```bash
agent-finder scan
agent-finder scan --json
agent-finder provider -h
agent-finder provider list
agent-finder provider inspect codex
agent-finder doctor
```

Detection and provider metadata come from `@rivus/agent-kit`'s `/catalog` and `/discovery` entries: seven built-in probe recipes, plus 20 probe recipes the CLI ships for the other catalog agents.

## License

MIT. See [LICENSE](LICENSE). Other packages in this repository have their own licenses; see the [root README](../../README.md#license).
