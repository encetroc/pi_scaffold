/**
 * Scaffold engine (pure — no pi APIs).
 *
 * Copies a template's `files/` tree to a destination, substituting `{{var}}`
 * in file content and in each path segment of the relative filename. All
 * template files are treated as UTF-8 text in v1 (binary templates are out of
 * scope). Source file modes (e.g. executable scripts) are preserved.
 */

import { readFileSync } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  writeFile,
  chmod,
  stat,
} from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { parseManifest, type Manifest } from "./manifest.js";
import { toPosix } from "./path.js";
import { substituteTemplate } from "./variables.js";
import { generateFoundation } from "./foundation.js";

export class ScaffoldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScaffoldError";
  }
}

export interface ScaffoldResult {
  /** Relative output paths (posix-style), in write order. */
  files: string[];
}

/**
 * Load a manifest from `templateDir` (reads and validates `manifest.json`).
 */
export function loadManifest(templateDir: string): Manifest {
  const manifestPath = join(templateDir, "manifest.json");
  try {
    return parseManifest(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    if (err instanceof Error && err.name === "ManifestError") {
      throw err;
    }
    throw new ScaffoldError(
      `cannot read manifest.json in ${templateDir}: ${(err as Error).message}`,
    );
  }
}

/** Substitute `{{var}}` in every path segment of a relative path. */
function substitutePath(relPath: string, vars: Record<string, string>): string {
  const segments = relPath.split(sep);
  return segments
    .map((segment) =>
      substituteTemplate(segment, vars, `filename "${relPath}"`),
    )
    .join(sep);
}

interface Entry {
  sourcePath: string;
  outRel: string;
  mode: number | undefined;
}

async function collectFiles(
  dir: string,
  baseDir: string,
  vars: Record<string, string>,
  out: Entry[],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = join(dir, entry.name);
    // Path relative to the template root (not the current recursion dir),
    // so nested files keep their full ancestry.
    const relPath = relative(baseDir, sourcePath);
    const outRel = substitutePath(relPath, vars);

    if (entry.isDirectory()) {
      await collectFiles(sourcePath, baseDir, vars, out);
      continue;
    }

    if (!entry.isFile()) {
      continue; // skip symlinks and special files in v1
    }

    let mode: number | undefined;
    try {
      mode = (await stat(sourcePath)).mode & 0o777;
    } catch {
      mode = undefined;
    }
    out.push({ sourcePath, outRel, mode });
  }
}

export interface ScaffoldOptions {
  /**
   * Generate the FOUNDATION context layer (docs/ tree, AGENTS.md,
   * tickets.md, .gitignore, test harness stub) after copying files.
   * Default true. Disable only to test the copy primitive in isolation.
   */
  foundation?: boolean;
}

/**
 * Scaffold `manifest`'s `files/` tree from `templateDir` into `destDir`,
 * then generate the FOUNDATION context layer (unless `foundation: false`).
 * Returns the list of written relative paths, in write order.
 *
 * Variable-substitution errors propagate unchanged (they are not "missing
 * files" errors); only a genuinely absent `files/` directory is wrapped.
 */
export async function scaffold(
  manifest: Manifest,
  templateDir: string,
  vars: Record<string, string>,
  destDir: string,
  options: ScaffoldOptions = {},
): Promise<ScaffoldResult> {
  const filesDir = join(templateDir, "files");

  let rootExists = false;
  try {
    await readdir(filesDir, { withFileTypes: true });
    rootExists = true;
  } catch {
    rootExists = false;
  }
  if (!rootExists) {
    throw new ScaffoldError(
      `template "${manifest.name}" has no files/ directory at ${filesDir}`,
    );
  }

  const entries: Entry[] = [];
  await collectFiles(filesDir, filesDir, vars, entries);

  if (entries.length === 0) {
    throw new ScaffoldError(
      `template "${manifest.name}" has no files in ${filesDir}`,
    );
  }

  await mkdir(destDir, { recursive: true });

  const written: string[] = [];
  for (const { sourcePath, outRel, mode } of entries) {
    const content = await readFile(sourcePath, "utf8");
    const substituted = substituteTemplate(content, vars, `file "${outRel}"`);
    const destPath = join(destDir, outRel);
    await mkdir(join(destPath, ".."), { recursive: true });
    await writeFile(destPath, substituted, "utf8");
    if (mode !== undefined) {
      await chmod(destPath, mode).catch(() => {
        /* best-effort: mode preservation never fails a scaffold */
      });
    }
    written.push(toPosix(outRel));
  }

  if (options.foundation !== false) {
    const foundationFiles = await generateFoundation(
      manifest,
      templateDir,
      vars,
      destDir,
    );
    written.push(...foundationFiles);
  }

  return { files: written };
}
