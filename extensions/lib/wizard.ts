/**
 * Scafstak wizard — the `/scafstak` happy path flow.
 *
 * This module is the interactive layer on top of the pure engine (ADR 0004):
 * it discovers installed templates, walks the questionnaire, confirms the
 * summary, then drives scaffold → git first-commit → verify → next-steps.
 *
 * All user interaction goes through the `WizardUi` seam so the flow is testable
 * with a scripted fake instead of a live terminal (ticket #7 acceptance).
 */

import { readdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import {
  initAndCommit,
  loadManifest,
  resolveVariables,
  scaffold,
  substituteTemplate,
  verify,
  type Manifest,
  type VerificationReport,
  type VerifyDepth,
} from "../../src/engine/index.js";

/** UI seam. Matches the subset of `ctx.ui` the wizard needs. */
export interface WizardUi {
  /**
   * Show a single-choice prompt; return the chosen option string, or
   * `undefined` when the user cancels.
   */
  select(prompt: string, options: string[]): Promise<string | undefined>;

  /** Show a text entry, prefilled with `initial`; `undefined` on cancel. */
  input(prompt: string, initial?: string): Promise<string | undefined>;

  /** Yes/No confirm; `false` when the user declines or cancels. */
  confirm(title: string, body: string): Promise<boolean>;
}

export class WizardCancelled extends Error {
  constructor(message = "scafstak wizard cancelled") {
    super(message);
    this.name = "WizardCancelled";
  }
}

export interface StackInfo {
  stack: string;
  versions: string[];
}

export interface WizardConfig {
  /** Root directory containing `<stack>/<version>/manifest.json` trees. */
  templatesDir: string;
  /** Working directory the scaffold lands in (relative targets resolve here). */
  cwd: string;
  /** Parsed `/scafstak` command args: `[stack]? [version]?`. */
  args: string[];
}

export interface WizardResult {
  manifest: Manifest;
  destDir: string;
  vars: Record<string, string>;
  files: string[];
  verification: VerificationReport;
}

/** The post-scaffold next-steps printout. */
export function nextSteps(result: WizardResult): string {
  const manifest = result.manifest;
  const run = manifest.commands?.run ?? "./scripts/run.sh";
  const lines = [
    `Scaffolded \`${manifest.stack} ${manifest.frameworkVersion}\` into \`${result.destDir}\`.`,
    ``,
    `cd ${result.destDir} && ${run}`,
    ``,
    `Docs map:`,
    `- docs/research/  — cited findings + go/no-go verdicts`,
    `- docs/specs/     — one testable spec per feature`,
    `- docs/decisions/ — ADRs: context → decision → consequences`,
    `- docs/playtests/ — feel/balance notes`,
    `- docs/vision.md  — one-page game design document`,
    `- docs/architecture.md — system design`,
    ``,
    `AGENTS.md drives the next agent session: workflow + docs map + stack commands.`,
  ];
  return lines.join("\n");
}

/**
 * Discover installed templates as `{ stack, versions[] }` entries.
 * A stack may have a single version; the pair is not collapsed here.
 */
export async function listStacks(templatesDir: string): Promise<StackInfo[]> {
  const kind = await readdir(templatesDir, { withFileTypes: true });
  const stacks: StackInfo[] = [];
  for (const entry of kind) {
    if (!entry.isDirectory()) continue;
    const versionEntries = await readdir(join(templatesDir, entry.name), {
      withFileTypes: true,
    });
    const versions: string[] = [];
    for (const fe of versionEntries) {
      if (fe.isDirectory()) versions.push(fe.name);
    }
    versions.sort((a, b) => a.localeCompare(b));
    stacks.push({ stack: entry.name, versions });
  }
  stacks.sort((a, b) => a.stack.localeCompare(b.stack));
  return stacks;
}

/** Resolve the target template from args or prompts. */
async function pickTemplate(
  ui: WizardUi,
  config: WizardConfig,
): Promise<{ version: string; templateDir: string }> {
  const stacks = await listStacks(config.templatesDir);
  if (stacks.length === 0) {
    throw new Error(
      `no templates found in ${config.templatesDir} (install scafstak templates)`,
    );
  }

  const requested = config.args[0];
  let stack =
    requested === undefined ? undefined : stacks.find((s) => s.stack === requested);
  if (!stack) {
    if (requested !== undefined) {
      throw new Error(
        `unknown stack "${requested}" (known: ${stacks.map((s) => s.stack).join(", ")})`,
      );
    }
    const chosen = await ui.select("Choose a stack:", stacks.map((s) => s.stack));
    if (chosen === undefined) throw new WizardCancelled("no stack picked");
    const found = stacks.find((s) => s.stack === chosen);
    if (!found) throw new WizardCancelled("no stack picked");
    stack = found;
  }

  let version: string;
  if (stack.versions.length > 1) {
    const requestedVersion = config.args[1];
    if (requestedVersion !== undefined && stack.versions.includes(requestedVersion)) {
      version = requestedVersion;
    } else {
      const picked = await ui.select(
        `${stack.stack} framework version:`,
        stack.versions,
      );
      if (picked === undefined) throw new WizardCancelled("no version picked");
      version = picked;
    }
  } else {
    const only = stack.versions[0];
    if (only === undefined) throw new WizardCancelled(`stack "${stack.stack}" has no versions`);
    version = only;
  }

  return { version, templateDir: join(config.templatesDir, stack.stack, version) };
}

/** Walk the generic + template questionnaire, honoring pre-filled defaults. */
async function collectAnswers(
  ui: WizardUi,
  manifest: Manifest,
): Promise<{ resolved: Record<string, string>; asked: Array<{ id: string; label: string }> }> {
  const projectName = await ui.input("Project name");
  if (projectName === undefined) throw new WizardCancelled("no project name");
  const name = projectName.trim();

  const targetDefault = name.length > 0 ? `.${sep}${name}` : ".";
  const targetDir = (await ui.input("Target directory", targetDefault)) ?? targetDefault;

  const resolved: Record<string, string> = { project_name: name, target_dir: targetDir };
  const asked: Array<{ id: string; label: string }> = [];

  for (const q of manifest.questions ?? []) {
    let initial = "";
    if (q.default !== undefined) {
      try {
        const vars = resolveVariables(manifest, resolved);
        initial = substituteTemplate(q.default, vars, `default for question "${q.id}"`);
      } catch {
        initial = q.default;
      }
    }
    const value = (await ui.input(`${q.label}:`, initial)) ?? initial;
    resolved[q.id] = value;
    asked.push({ id: q.id, label: q.label });
  }

  return { resolved, asked };
}

/** Human-readable manifest summary for the confirm dialog. */
function summarize(manifest: Manifest, resolved: Record<string, string>, destDir: string): string {
  const lines = [
    `Stack: ${manifest.stack} ${manifest.frameworkVersion} (${manifest.language})`,
    `Name: ${resolved.project_name}`,
    `Target: ${destDir}`,
  ];
  for (const q of manifest.questions ?? []) {
    lines.push(`- ${q.label}: ${resolved[q.id] ?? ""}`);
  }
  return lines.join("\n");
}

/**
 * Run the interactive happy path. Throws `WizardCancelled` when the user backs
 * out at any step. Writes nothing before the summary is confirmed.
 */
export async function runWizard(
  ui: WizardUi,
  config: WizardConfig,
): Promise<WizardResult> {
  const { templateDir } = await pickTemplate(ui, config);
  const manifest = loadManifest(templateDir);

  const { resolved } = await collectAnswers(ui, manifest);
  const destDir = resolve(config.cwd, resolved.target_dir ?? ".");

  if (!(await ui.confirm("Scaffold project?", summarize(manifest, resolved, destDir)))) {
    throw new WizardCancelled("summary declined");
  }

  const vars = resolveVariables(manifest, resolved);
  const scaffolded = await scaffold(manifest, templateDir, vars, destDir);
  await initAndCommit(destDir);

  const choice = await ui.select("Verify degree:", [
    "Light (toolchain check)",
    "Full (build)",
    "skip",
  ]);
  let depth: VerifyDepth = "light";
  if (choice === "Full (build)") depth = "full";
  else if (choice === "skip") depth = "skip";
  const verification = await verify(manifest, destDir, depth);

  return {
    manifest,
    destDir,
    vars,
    files: scaffolded.files,
    verification,
  };
}