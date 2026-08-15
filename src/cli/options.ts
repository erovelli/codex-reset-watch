export type OptionKind = "boolean" | "value";

export function parseOptions(args: string[], specification: Record<string, OptionKind>): Map<string, string | true> {
  const result = new Map<string, string | true>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined || !(argument in specification)) throw new Error(`Unknown option: ${argument ?? ""}`);
    if (result.has(argument)) throw new Error(`Option may be provided only once: ${argument}`);
    if (specification[argument] === "boolean") {
      result.set(argument, true);
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Option requires a value: ${argument}`);
    result.set(argument, value);
    index += 1;
  }
  return result;
}

export function requireNoOptions(args: string[]): void {
  if (args.length > 0) throw new Error(`This command does not accept options: ${args.join(" ")}`);
}
