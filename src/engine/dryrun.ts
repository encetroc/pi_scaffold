/**
 * Template dry-run verification (pure — no pi APIs, per ADR 0004).
 *
 * Backs the `scafstak_verify_template` tool (#10): load the manifest, resolve
 * every question from its defaults (a question with no answer and no default
 * fails loudly — no template ships with a hole), scaffold into a fresh temp
 * dir, then run the manifest's verify commands at the `dry-run` depth
 * (toolchain check, then build). The temp dir is kept so an author can
 * inspect a failing scaffold; the OS temp location bounds the cost.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Manifest } from "./manifest.js";
import { resolvedAnswers } from "./questions.js";
import { loadManifest, scaffold } from "./scaffold.js";
import { resolveVariables } from "./variables.js";
import { verify, type VerificationReport } from "./verify.js";

export interface DryRunResult {
  manifest: Manifest;
  /** The temp dir the scaffold landed in; kept for inspection. */
  tempDir: string;
  files: string[];
  verification: VerificationReport;
}

/**
 * A clean, identifier-safe project name for the dry-run so derived variables
 * (e.g. a snake_case crate name) stay valid for the stack's toolchain.
 */
function dryRunProjectName(stack: string): string {
  const safe = stack.replace(/[^A-Za-z0-9_-]+/g, "-");
  return `dryrun-${safe}`;
}

/**
 * Dry-run a template: default answers → scaffold → verifyCheck + verifyBuild.
 * Domain errors propagate unchanged (ManifestError, QuestionError,
 * ScaffoldError, VariableError) so callers can report them loudly.
 */
export async function dryRunTemplate(
  templateDir: string,
): Promise<DryRunResult> {
  const manifest = loadManifest(templateDir);

  const answers = resolvedAnswers(manifest, {
    project_name: dryRunProjectName(manifest.stack),
    target_dir: ".",
  });
  const vars = resolveVariables(manifest, answers);

  const tempDir = await mkdtemp(join(tmpdir(), "scafstak-dryrun-"));
  const scaffolded = await scaffold(manifest, templateDir, vars, tempDir);
  const verification = await verify(manifest, tempDir, "dry-run");

  return { manifest, tempDir, files: scaffolded.files, verification };
}
