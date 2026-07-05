#!/usr/bin/env bun
import {
  existsSync,
  mkdirSync,
  cpSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from "fs";
import { join, basename, dirname } from "path";

const TEMPLATE_DIR = join(import.meta.dir, "..", "template");

/**
 * Version range of @donilite/wrap injected into scaffolded projects —
 * both packages are released together from the same tag, so the CLI's
 * own version is the framework version.
 */
const WRAP_VERSION = `^${
  JSON.parse(
    readFileSync(join(import.meta.dir, "..", "package.json"), "utf-8"),
  ).version
}`;

/** Entries never copied into a scaffolded project. */
const COPY_IGNORE = new Set([
  "node_modules",
  "bun.lock",
  ".env",
  "drizzle",
  "dist",
]);

interface Config {
  projectName: string;
  dbName: string;
  targetDir: string;
}

function log(
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

function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
}

function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
    .replace(/^(.)/, (c) => c.toUpperCase());
}

function replacePlaceholders(content: string, config: Config): string {
  return content
    .replace(/\{\{APP_NAME\}\}/g, config.projectName)
    .replace(/\{\{APP_NAME_SNAKE\}\}/g, toSnakeCase(config.projectName))
    .replace(/\{\{APP_NAME_PASCAL\}\}/g, toPascalCase(config.projectName))
    .replace(/\{\{DB_NAME\}\}/g, config.dbName);
}

function copyTemplateFiles(srcDir: string, destDir: string, config: Config) {
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  const entries = readdirSync(srcDir);

  for (const entry of entries) {
    if (COPY_IGNORE.has(entry)) continue;
    const srcPath = join(srcDir, entry);
    const destPath = join(destDir, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyTemplateFiles(srcPath, destPath, config);
    } else {
      // Read and replace placeholders in text files
      const ext = entry.split(".").pop() || "";
      const textExtensions = [
        "ts",
        "json",
        "md",
        "yml",
        "yaml",
        "env",
        "example",
        "gitignore",
      ];

      if (textExtensions.includes(ext) || entry.startsWith(".")) {
        const content = readFileSync(srcPath, "utf-8");
        const replaced = replacePlaceholders(content, config);
        writeFileSync(destPath, replaced);
      } else {
        // Binary files - just copy
        cpSync(srcPath, destPath);
      }
    }
  }
}

async function main() {
  console.log("\n🚀 \x1b[1m\x1b[35mLite Backend Template\x1b[0m\n");

  // Get project name from args or prompt
  let projectName = process.argv[2];

  if (!projectName) {
    process.stdout.write("Project name: ");
    for await (const line of console) {
      projectName = line.trim();
      break;
    }
  }

  if (!projectName) {
    log("Project name is required", "error");
    process.exit(1);
  }

  const targetDir = join(process.cwd(), projectName);

  if (existsSync(targetDir)) {
    log(`Directory "${projectName}" already exists`, "error");
    process.exit(1);
  }

  const dbName = `${toSnakeCase(projectName)}_db`;

  const config: Config = {
    projectName,
    dbName,
    targetDir,
  };

  log(`Creating project "${projectName}"...`, "info");

  // Copy template files
  copyTemplateFiles(TEMPLATE_DIR, targetDir, config);

  // Patch package.json: project name + real @donilite/wrap version
  // (the template uses a workspace link inside the monorepo)
  const pkgPath = join(targetDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  pkg.name = toSnakeCase(projectName);
  if (pkg.dependencies?.["@donilite/wrap"]) {
    pkg.dependencies["@donilite/wrap"] = WRAP_VERSION;
  }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  // Rename .gitignore.template to .gitignore (npm ignores .gitignore files)
  const gitignoreTemplate = join(targetDir, "gitignore.template");
  const gitignore = join(targetDir, ".gitignore");
  if (existsSync(gitignoreTemplate)) {
    cpSync(gitignoreTemplate, gitignore);
    Bun.spawnSync(["rm", gitignoreTemplate]);
  }

  // Rename .env.example if needed
  const envExample = join(targetDir, ".env.example");
  const envFile = join(targetDir, ".env");
  if (existsSync(envExample) && !existsSync(envFile)) {
    cpSync(envExample, envFile);
  }

  log("Template files copied", "success");

  // Install dependencies
  log("Installing dependencies...", "info");
  const installResult = Bun.spawnSync(["bun", "install"], {
    cwd: targetDir,
    stdout: "inherit",
    stderr: "inherit",
  });

  if (installResult.exitCode === 0) {
    log("Dependencies installed", "success");
  } else {
    log("Failed to install dependencies. Run 'bun install' manually.", "warn");
  }

  console.log("\n\x1b[1m\x1b[32m✨ Project created successfully!\x1b[0m\n");
  console.log("Next steps:\n");
  console.log(`  \x1b[36mcd ${projectName}\x1b[0m`);
  console.log("  \x1b[36mbun run wake:db\x1b[0m      # Start PostgreSQL");
  console.log("  \x1b[36mbun run push:db\x1b[0m     # Push schema to database");
  console.log("  \x1b[36mbun run dev\x1b[0m         # Start dev server");
  console.log(
    "\n  Then visit \x1b[35mhttp://localhost:5000/docs\x1b[0m for Swagger UI\n",
  );
}

main().catch((err) => {
  log(err.message, "error");
  process.exit(1);
});
