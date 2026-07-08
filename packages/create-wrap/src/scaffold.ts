import {
  existsSync,
  mkdirSync,
  cpSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  rmSync,
} from "fs";
import { join } from "path";
import type { ProfileAnswers, ProfileId } from "./profiles";
import { toPascalCase, toSnakeCase } from "./utils";

const TEMPLATE_DIR = join(import.meta.dir, "..", "template");
const PROFILES_DIR = join(import.meta.dir, "..", "profiles");

/** Entries never copied into a scaffolded project. */
const COPY_IGNORE = new Set([
  "node_modules",
  "bun.lock",
  ".env",
  "drizzle",
  "dist",
]);

/** Extensions whose content gets `{{PLACEHOLDER}}` substitution. */
const TEXT_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "jsx",
  "json",
  "md",
  "yml",
  "yaml",
  "env",
  "example",
  "gitignore",
]);

export interface Config {
  projectName: string;
  dbName: string;
  targetDir: string;
}

function replacePlaceholders(content: string, config: Config): string {
  return content
    .replace(/\{\{APP_NAME\}\}/g, config.projectName)
    .replace(/\{\{APP_NAME_SNAKE\}\}/g, toSnakeCase(config.projectName))
    .replace(/\{\{APP_NAME_PASCAL\}\}/g, toPascalCase(config.projectName))
    .replace(/\{\{DB_NAME\}\}/g, config.dbName);
}

/**
 * Recursively copy a directory tree, substituting `{{PLACEHOLDER}}`s in
 * text files and applying `COPY_IGNORE`. Used both for the base template
 * and for a profile's `files/` overlay (which reuses the exact same rules
 * — same as the base template, an overlay file with `.ts`/`.json`/etc.
 * gets placeholder substitution too).
 */
function copyTree(srcDir: string, destDir: string, config: Config) {
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  for (const entry of readdirSync(srcDir)) {
    if (COPY_IGNORE.has(entry)) continue;
    const srcPath = join(srcDir, entry);
    const destPath = join(destDir, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyTree(srcPath, destPath, config);
    } else {
      const ext = entry.split(".").pop() || "";
      if (TEXT_EXTENSIONS.has(ext) || entry.startsWith(".")) {
        const content = readFileSync(srcPath, "utf-8");
        writeFileSync(destPath, replacePlaceholders(content, config));
      } else {
        cpSync(srcPath, destPath);
      }
    }
  }
}

/** Delete a list of project-relative paths (files or directories), if present. */
function removePaths(targetDir: string, relativePaths: string[]) {
  for (const rel of relativePaths) {
    const abs = join(targetDir, rel);
    if (existsSync(abs)) {
      rmSync(abs, { recursive: true, force: true });
    }
  }
}

/** Parse a `remove.txt` (one relative path per line, `#` comments, blank lines ignored). */
function parseRemoveList(path: string): string[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/**
 * Non-full-backend profiles are generated as a diff against the base
 * template: delete what the profile doesn't need, then layer the
 * profile's own files on top (both listed in `packages/create-wrap/profiles/<id>/`).
 */
function applyProfileOverlay(profileId: ProfileId, targetDir: string, config: Config) {
  const profileDir = join(PROFILES_DIR, profileId);
  const removeListPath = join(profileDir, "remove.txt");
  const filesDir = join(profileDir, "files");

  removePaths(targetDir, parseRemoveList(removeListPath));

  if (existsSync(filesDir)) {
    copyTree(filesDir, targetDir, config);
  }
}

/** Remove a contiguous block of lines between (and including) two markers, if both are found. */
function stripBlock(content: string, startMarker: string, endMarker: string): string {
  const start = content.indexOf(startMarker);
  if (start === -1) return content;
  const end = content.indexOf(endMarker, start);
  if (end === -1) return content;
  return content.slice(0, start) + content.slice(end + endMarker.length);
}

/**
 * full-backend's two yes/no follow-ups (Redis cache, realtime) are single
 * conditional blocks each — small enough to apply as text edits directly
 * on the copied template instead of a whole alternate file set.
 */
function applyFullBackendToggles(targetDir: string, answers: ProfileAnswers) {
  const needsRedis = answers.enableRedisCache || answers.enableRealtime;

  if (!answers.enableRedisCache) {
    const bootstrapPath = join(targetDir, "src/bootstrap.ts");
    let content = readFileSync(bootstrapPath, "utf-8");
    content = content.replace(
      `import {
  configureCache,
  initializeDatabase,
  RedisCacheStore,
} from "@donilite/wrap";`,
      `import { initializeDatabase } from "@donilite/wrap";`,
    );
    content = stripBlock(
      content,
      "// Cache backend: Redis when REDIS_URL is set, in-memory otherwise.",
      "}\n",
    );
    writeFileSync(bootstrapPath, content.trimEnd() + "\n");
  }

  if (!answers.enableRealtime) {
    const indexPath = join(targetDir, "src/index.ts");
    let content = readFileSync(indexPath, "utf-8");

    // Order matters: collapse the listen() call to its plain form FIRST,
    // while `realtime.websocket` is still in scope for the literal match —
    // removing the `const realtime = ...` declaration before this would
    // leave nothing for this replace to match.
    content = content.replace(
      `const server = app.listen(appConfig.port, appConfig.host, {
  websocket: realtime.websocket,
});
realtime.attach(server);
realtime.bindEntityEvents();
`,
      `const server = app.listen(appConfig.port, appConfig.host);`,
    );

    content = content.replace(
      `import { createRealtime } from "@donilite/wrap/realtime";\n`,
      "",
    );

    content = content.replace(
      `
// Realtime: native Bun WebSocket topics + optional Redis relay for
// multi-instance fan-out. Entity writes are auto-published on
// \`entity:<table>\` channels. Uses the \`.raw\` escape hatch — realtime needs
// the underlying Hono instance and the raw Bun.serve server handle.
const realtime = createRealtime({ redisUrl: process.env.REDIS_URL });
app.get("/realtime", realtime.upgrade);

`,
      "\n",
    );

    writeFileSync(indexPath, content);
  }

  if (!needsRedis) {
    const composePath = join(targetDir, "compose.yml");
    if (existsSync(composePath)) {
      let content = readFileSync(composePath, "utf-8");
      content = content.replace(
        /\n {2}\S+_redis:\n(?: {4}.*\n)+/,
        "\n",
      );
      writeFileSync(composePath, content);
    }

    const envPath = join(targetDir, ".env.example");
    if (existsSync(envPath)) {
      let content = readFileSync(envPath, "utf-8");
      content = content.replace(
        /# Redis \(cache backend \+ realtime multi-instance relay\)\nREDIS_PORT="6379"\nREDIS_URL="redis:\/\/localhost:\$\{REDIS_PORT\}"\n\n/,
        "",
      );
      writeFileSync(envPath, content);
    }
  }
}

/**
 * Scaffold a project: copy the base template, apply the profile's
 * overlay (a no-op for full-backend, which the base template already
 * matches), apply full-backend's own toggles, then the common
 * housekeeping every profile shares (package.json patching, .gitignore
 * rename, .env seeding).
 */
export function scaffoldProject(config: Config, answers: ProfileAnswers, wrapVersion: string) {
  copyTree(TEMPLATE_DIR, config.targetDir, config);

  if (answers.profile === "full-backend") {
    applyFullBackendToggles(config.targetDir, answers);
  } else {
    applyProfileOverlay(answers.profile, config.targetDir, config);
  }

  // Patch package.json: project name + real @donilite/wrap version (the
  // template/profile files use a workspace link inside the monorepo).
  const pkgPath = join(config.targetDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  pkg.name = toSnakeCase(config.projectName);
  if (pkg.dependencies?.["@donilite/wrap"]) {
    pkg.dependencies["@donilite/wrap"] = wrapVersion;
  }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  // Rename gitignore.template -> .gitignore (npm ignores .gitignore files
  // inside a published package, so it's shipped renamed).
  const gitignoreTemplate = join(config.targetDir, "gitignore.template");
  const gitignore = join(config.targetDir, ".gitignore");
  if (existsSync(gitignoreTemplate)) {
    cpSync(gitignoreTemplate, gitignore);
    rmSync(gitignoreTemplate);
  }

  // Seed .env from .env.example.
  const envExample = join(config.targetDir, ".env.example");
  const envFile = join(config.targetDir, ".env");
  if (existsSync(envExample) && !existsSync(envFile)) {
    cpSync(envExample, envFile);
  }
}
