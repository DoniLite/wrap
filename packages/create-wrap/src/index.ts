#!/usr/bin/env bun
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { text } from "./prompts";
import { promptForAnswers, PROFILES } from "./profiles";
import { scaffoldProject, type Config } from "./scaffold";
import { log, toSnakeCase } from "./utils";

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

async function main() {
  console.log("\n🚀 \x1b[1m\x1b[35m@donilite/create-wrap\x1b[0m\n");

  // Project name: CLI arg or prompt.
  let projectName = process.argv[2];
  if (!projectName) {
    projectName = await text("Project name");
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

  const answers = await promptForAnswers();
  const profileLabel = PROFILES.find((p) => p.id === answers.profile)?.label ?? answers.profile;

  const config: Config = {
    projectName,
    dbName: `${toSnakeCase(projectName)}_db`,
    targetDir,
  };

  log(`Creating "${projectName}" (${profileLabel})...`, "info");
  scaffoldProject(config, answers, WRAP_VERSION);
  log("Project files generated", "success");

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
  console.log("  \x1b[36mbun run init:env\x1b[0m   # copy .env.example -> .env");
  if (answers.profile === "full-backend") {
    console.log("  \x1b[36mbun run wake:db\x1b[0m    # start PostgreSQL" + (answers.enableRedisCache || answers.enableRealtime ? " + Redis" : ""));
    console.log("  \x1b[36mbun run push:db\x1b[0m   # apply the schema");
  }
  console.log("  \x1b[36mbun run dev\x1b[0m       # start the dev server");
  console.log(
    "\n  Then visit \x1b[35mhttp://localhost:5000/docs\x1b[0m for Swagger UI\n",
  );
}

main().catch((err) => {
  log(err.message, "error");
  process.exit(1);
});
