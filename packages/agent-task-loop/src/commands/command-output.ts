interface CommandOutput {
  json: boolean;
  jsonValue: unknown;
  textLines: readonly string[];
}

export function printCommandOutput(output: CommandOutput): void {
  if (output.json) {
    console.log(JSON.stringify(output.jsonValue, null, 2));
    return;
  }

  for (const line of output.textLines) {
    console.log(line);
  }
}
