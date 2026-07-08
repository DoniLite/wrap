export function log(
  message: string,
  type: "info" | "success" | "error" | "warn" = "info",
) {
  const colors = {
    info: "\x1b[36m",
    success: "\x1b[32m",
    error: "\x1b[31m",
    warn: "\x1b[33m",
  };
  const reset = "\x1b[0m";
  const icons = {
    info: "ℹ",
    success: "✔",
    error: "✖",
    warn: "⚠",
  };
  console.log(`${colors[type]}${icons[type]} ${message}${reset}`);
}

export function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
}

export function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
    .replace(/^(.)/, (c) => c.toUpperCase());
}
