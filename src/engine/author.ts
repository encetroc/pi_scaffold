/**
 * Template authoring (pure — no pi APIs, per ADR 0004).
 *
 * Backs the `scafstak_new_template` tool (#10): creates a new template
 * skeleton at `<templatesDir>/<stack>/<version>/` — a validated
 * `manifest.json`, a `getting-started.md` placeholder, and a `files/` tree.
 * With `source`, the existing project tree is harvested into `files/`
 * verbatim (build artifacts excluded); templatizing it (answers, `{{var}}`)
 * is the agent's job. The written manifest is re-parsed through the same
 * validator the engine uses, so a skeleton can never be created broken.
 */

import { mkdir, readFile, readdir, stat, writeFile, chmod } from "node:fs/promises";
import { join, relative } from "node:path";

import { parseManifest, type Manifest } from "./manifest.js";
import { toPosix } from "./path.js";

export class AuthorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorError";
  }
}

export interface NewTemplateOptions {
  /** Root containing `<stack>/<version>/` template trees. */
  templatesDir: string;
  stack: string;
  version: string;
  language: string;
  /** Manifest `frameworkVersion`; defaults to `version`. */
  frameworkVersion?: string;
  /** Authoring-time doc sources; written to `manifest.references`. */
  references?: string[];
  /**
   * Existing project to harvest into `files/` verbatim (build artifacts
   * and `.git`/`node_modules` excluded).
   */
  source?: string;
}

export interface NewTemplateResult {
  /** Absolute path of the created template dir. */
  templateDir: string;
  manifest: Manifest;
  /** Harvested files (posix relative paths), empty when no `source`. */
  harvestedFiles: string[];
}

/** Directories never harvested from a source project. */
const HARVEST_EXCLUDES = new Set([".git", "node_modules", "target", "dist", "build"]);

const GETTING_STARTED_PLACEHOLDER = (stack: string, version: string): string =>
  [
    `# ${stack} ${version} — getting started`,
    ``,
    `<!-- Authoring checklist (agent):`,
    `     1. Research the official docs listed in manifest.json "references".`,
    `     2. Write system dependencies, setup steps, and canonical run/test`,
    `        commands for this stack.`,
    `     3. Cover platform quirks (e.g. WSL, Windows-browser access).`,
    `     4. Cite official docs inline.`,
    `     This file is embedded into the scaffolded project's AGENTS.md as the`,
    `     Setup section. -->`,
    ``,
    `## Setup`,
    ``,
    `TODO: system deps, install steps, canonical commands — cite official docs.`,
    ``,
    `## Run`,
    ``,
    `TODO: \`./scripts/run.sh\``,
    ``,
    `## Test`,
    ``,
    `TODO: \`./scripts/test.sh\``,
    ``,
  ].join("\n");

function assertNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new AuthorError(`"${field}" is required and must be non-empty`);
  }
  return trimmed;
}

/**
 * Copy one file preserving its permission bits (same approach as the
 * scaffold copy loop, so harvested scripts keep their exec bits).
 */
async function copyWithMode(source: string, dest: string): Promise<void> {
  const content = await readFile(source);
  const info = await stat(source);
  await writeFile(dest, content);
  try {
    await chmod(dest, info.mode & 0o777);
  } catch {
    /* best-effort: mode preservation never fails a harvest */
  }
}

/**
 * Harvest `sourceDir` (and everything below it) into `destDir`, verbatim.
 * Build/state directories are excluded; file modes are preserved. Returns
 * the harvested relative paths (posix), sorted.
 */
export async function harvestSource(
  sourceDir: string,
  destDir: string,
): Promise<string[]> {
  const rels: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable dir: nothing to harvest from it
    }
    for (const entry of entries) {
      if (HARVEST_EXCLUDES.has(entry.name)) continue;
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue; // skip symlinks and special files in v1
      const destPath = join(destDir, relative(sourceDir, join(dir, entry.name)));
      await mkdir(join(destPath, ".."), { recursive: true });
      await copyWithMode(join(dir, entry.name), destPath);
      rels.push(toPosix(relative(sourceDir, join(dir, entry.name))));
    }
  }

  const source = await stat(sourceDir);
  if (!source.isDirectory()) {
    throw new AuthorError(`--source is not a directory: ${sourceDir}`);
  }
  await mkdir(destDir, { recursive: true });
  await walk(sourceDir);
  rels.sort((a, b) => a.localeCompare(b));
  return rels;
}

/**
 * Create a new template skeleton. Throws `AuthorError` when the target
 * template dir already exists (never clobbers) or `source` is missing.
 */
export async function newTemplate(
  options: NewTemplateOptions,
): Promise<NewTemplateResult> {
  const stack = assertNonEmpty(options.stack, "stack");
  const version = assertNonEmpty(options.version, "version");
  const language = assertNonEmpty(options.language, "language");
  const frameworkVersion =
    options.frameworkVersion === undefined || options.frameworkVersion.trim() === ""
      ? version
      : options.frameworkVersion.trim();

  const templateDir = join(options.templatesDir, stack, version);

  try {
    await stat(templateDir);
    throw new AuthorError(`template already exists at ${templateDir}`);
  } catch (err) {
    if (err instanceof AuthorError) throw err;
    // ENOENT — proceed.
  }

  if (options.source !== undefined) {
    try {
      await stat(options.source);
    } catch {
      throw new AuthorError(`--source not found: ${options.source}`);
    }
  }

  const manifest: Manifest = {
    name: `${stack}-${version}`,
    stack,
    frameworkVersion,
    language,
    buildTargets: [],
    questions: [],
    variables: {},
    commands: {},
    gettingStarted: "getting-started.md",
    references: options.references ?? [],
  };

  await mkdir(join(templateDir, "files"), { recursive: true });
  await writeFile(
    join(templateDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
  await writeFile(
    join(templateDir, "getting-started.md"),
    GETTING_STARTED_PLACEHOLDER(stack, version),
    "utf8",
  );

  // Re-validate what we wrote through the same validator the engine uses:
  // a skeleton can never be created broken.
  parseManifest(await readFile(join(templateDir, "manifest.json"), "utf8"));

  const harvestedFiles =
    options.source === undefined
      ? []
      : await harvestSource(options.source, join(templateDir, "files"));

  return { templateDir, manifest, harvestedFiles };
}