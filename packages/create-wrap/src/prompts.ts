/**
 * Minimal interactive-prompt helpers, hand-rolled on top of Bun's stdin
 * async iterator instead of pulling in a prompts library (`@clack/prompts`
 * et al.) — this CLI is a one-shot scaffolding tool invoked via `bunx`, so
 * keeping it dependency-light matters more than fancy TUI widgets, and the
 * original CLI already used the same `for await (const line of console)`
 * pattern for its single prompt. If this ever grows real multi-step TUI
 * needs (arrow-key navigation, spinners), swapping in `@clack/prompts` is a
 * contained change — every call site here goes through the three functions
 * below.
 */

/** Reads one line from stdin, trimmed. Empty input returns "". */
async function readLine(): Promise<string> {
  for await (const line of console) {
    return line.trim();
  }
  return "";
}

/** Free-text prompt with an optional default shown in brackets. */
export async function text(
  message: string,
  options: { default?: string } = {},
): Promise<string> {
  const suffix = options.default ? ` \x1b[2m(${options.default})\x1b[0m` : "";
  process.stdout.write(`\x1b[36m?\x1b[0m ${message}${suffix}: `);
  const answer = await readLine();
  return answer || options.default || "";
}

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
}

/**
 * Numbered-menu single select — types a number (1-based) rather than
 * arrow-key navigation. Re-prompts on invalid input; accepts the default
 * (option 1) on an empty line.
 */
export async function select<T extends string>(
  message: string,
  options: SelectOption<T>[],
): Promise<T> {
  console.log(`\x1b[36m?\x1b[0m ${message}`);
  options.forEach((opt, i) => {
    const hint = opt.hint ? ` \x1b[2m— ${opt.hint}\x1b[0m` : "";
    console.log(`  \x1b[33m${i + 1}\x1b[0m) ${opt.label}${hint}`);
  });

  while (true) {
    process.stdout.write(`Choose 1-${options.length} \x1b[2m(1)\x1b[0m: `);
    const answer = await readLine();
    if (!answer) return options[0]!.value;
    const index = Number.parseInt(answer, 10) - 1;
    if (Number.isInteger(index) && index >= 0 && index < options.length) {
      return options[index]!.value;
    }
    console.log("\x1b[31mInvalid choice, try again.\x1b[0m");
  }
}

/** Yes/no confirm, defaulting to `defaultValue` on an empty line. */
export async function confirm(
  message: string,
  defaultValue = true,
): Promise<boolean> {
  const hint = defaultValue ? "Y/n" : "y/N";
  process.stdout.write(`\x1b[36m?\x1b[0m ${message} \x1b[2m(${hint})\x1b[0m: `);
  const answer = (await readLine()).toLowerCase();
  if (!answer) return defaultValue;
  return answer === "y" || answer === "yes";
}
