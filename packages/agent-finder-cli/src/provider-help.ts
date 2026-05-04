export function printProviderHelpAndExitIfRequested(argv: string[]): void {
  if (argv[2] !== "provider" || (argv[3] !== "-h" && argv[3] !== "--help")) {
    return;
  }

  console.log(`Inspect supported providers (agent-finder provider v0.1.0)

USAGE agent-finder provider list|inspect

COMMANDS

     list    List supported provider IDs and display names
  inspect    Show provider metadata without reading local config contents

Use agent-finder provider <command> --help for more information about a command.`);
  process.exit(0);
}
