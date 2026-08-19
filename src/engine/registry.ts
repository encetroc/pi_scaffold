/**
 * Template registry (pure — no pi APIs, per ADR 0004).
 *
 * Backs the `scafstak_list` tool (#10): walks `<templatesDir>/<stack>/<version>/`
 * and reports each registered template's metadata from its manifest — stack,
 * framework version, language, and build targets. A directory whose manifest
 * fails validation is reported as an error entry rather than silently hidden,
 * so authoring agents see broken templates loudly instead of wondering why a
 * stack vanished from the list.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { loadManifest } from "./scaffold.js";

export interface TemplateEntry {
  stack: string;
  version: string;
  name: string;
  language: string;
  buildTargets: string[];
}

export interface TemplateProblem {
  /** Template dir relative to the templates root, e.g. "bevy/0.19". */
  template: string;
  message: string;
}

export interface RegistryReport {
  templates: TemplateEntry[];
  errors: TemplateProblem[];
}

/**
 * Discover registered templates. Directories without a `manifest.json` are
 * not templates and are skipped silently; a present but invalid manifest is
 * reported in `errors` with the offending path.
 */
export async function listTemplates(
  templatesDir: string,
): Promise<RegistryReport> {
  const stacks = await readdir(templatesDir, { withFileTypes: true });
  const templates: TemplateEntry[] = [];
  const errors: TemplateProblem[] = [];

  for (const stackEntry of stacks) {
    if (!stackEntry.isDirectory()) continue;
    const stackDir = join(templatesDir, stackEntry.name);

    let versions;
    try {
      versions = await readdir(stackDir, { withFileTypes: true });
    } catch {
      continue; // unreadable stack dir: not ours to report
    }

    for (const versionEntry of versions) {
      if (!versionEntry.isDirectory()) continue;
      const rel = `${stackEntry.name}/${versionEntry.name}`;
      try {
        const manifest = loadManifest(join(stackDir, versionEntry.name));
        templates.push({
          stack: manifest.stack,
          version: manifest.frameworkVersion,
          name: manifest.name,
          language: manifest.language,
          buildTargets: manifest.buildTargets ?? [],
        });
      } catch (err) {
        errors.push({
          template: rel,
          message: (err as Error).message,
        });
      }
    }
  }

  templates.sort(
    (a, b) => a.stack.localeCompare(b.stack) || a.version.localeCompare(b.version),
  );
  return { templates, errors };
}
