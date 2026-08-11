import { createInterface, type Interface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

export class Prompt {
  private readonly interface: Interface = createInterface({ input: stdin, output: stdout });

  async ask(label: string, defaultValue?: string): Promise<string> {
    const suffix = defaultValue === undefined ? ": " : ` [${defaultValue}]: `;
    const answer = (await this.interface.question(`${label}${suffix}`)).trim();
    return answer || defaultValue || "";
  }

  async confirm(label: string, defaultYes = false): Promise<boolean> {
    const answer = (await this.interface.question(`${label} ${defaultYes ? "[Y/n]" : "[y/N]"}: `)).trim().toLowerCase();
    if (!answer) return defaultYes;
    return answer === "y" || answer === "yes";
  }

  async choose(label: string, choices: string[], defaultIndex = 0): Promise<number> {
    console.log(label);
    choices.forEach((choice, index) => console.log(`  ${index + 1}) ${choice}${index === defaultIndex ? " (default)" : ""}`));
    while (true) {
      const raw = await this.ask("Choice", String(defaultIndex + 1));
      const index = Number(raw) - 1;
      if (Number.isInteger(index) && index >= 0 && index < choices.length) return index;
      console.log(`Enter a number from 1 to ${choices.length}.`);
    }
  }

  close(): void {
    this.interface.close();
  }
}
