/**
 * Interactive-prompt helpers, backed by `@clack/prompts` — a real,
 * TTY-aware prompts library.
 *
 * The original hand-rolled version (`for await (const line of console)`)
 * broke after the *first* prompt in a real interactive terminal: breaking
 * out of a `for-await-of` loop calls the async iterator's `.return()`,
 * and for a readline-backed iterable that leaves stdin in a state where a
 * second `for-await-of console` no longer blocks for input — it resolves
 * immediately instead of waiting, so every prompt after the first was
 * skipped. That's invisible when testing with piped/non-TTY stdin (which
 * doesn't hit the same code path), which is exactly why it shipped
 * looking fine. `@clack/prompts` handles real TTY input correctly and is
 * the standard choice for this kind of one-shot scaffolding CLI.
 *
 * Every call site goes through the three functions below, so the actual
 * prompt engine stays swappable without touching `profiles.ts`/`index.ts`.
 */
import * as clack from "@clack/prompts";

/** Ctrl+C / Esc during any prompt exits cleanly instead of propagating a symbol. */
function handleCancel<T>(value: T | symbol): T {
  if (clack.isCancel(value)) {
    clack.cancel("Cancelled.");
    process.exit(0);
  }
  return value;
}

/** Free-text prompt with an optional default (used when the input is empty). */
export async function text(
  message: string,
  options: { default?: string } = {},
): Promise<string> {
  const answer = await clack.text({
    message,
    placeholder: options.default,
    defaultValue: options.default,
  });
  return handleCancel(answer);
}

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
}

/** Single select. */
export async function select<T extends string>(
  message: string,
  options: SelectOption<T>[],
): Promise<T> {
  const answer = await clack.select<T>({
    message,
    options,
    initialValue: options[0]?.value,
  });
  return handleCancel(answer);
}

/** Yes/no confirm, defaulting to `defaultValue`. */
export async function confirm(
  message: string,
  defaultValue = true,
): Promise<boolean> {
  const answer = await clack.confirm({
    message,
    initialValue: defaultValue,
  });
  return handleCancel(answer);
}
