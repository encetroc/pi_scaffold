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
import { basename, join, resolve, sep } from "node:path";

import {
  initAndCommit,
  loadManifest,
  resolvedAnswers,
  resolveVariables,
  scaffold,
  verify,
  type Manifest,
  type VerificationReport,
  type VerifyDepth,
} from "../../src/engine/index.js";

import { addAndPush, createGitHubRepo } from "./remote.js";

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

  /**
   * Run blocking work (git, build, verify) behind an activity indicator so
   * the user can tell a long phase is running vs finished. Must await
   * `task` and return its value.
   */
  runInProgress<T>(label: string, task: () => Promise<T>): Promise<T>;
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

/** What the wizard did with a remote after the first commit (ticket #9). */
export type RemoteOutcome =
  | { choice: "none" }
  | { choice: "url"; url: string }
  | { choice: "gh"; repoName: string; visibility: "public" | "private" };

export interface WizardResult {
  manifest: Manifest;
  destDir: string;
  vars: Record<string, string>;
  files: string[];
  verification: VerificationReport;
  remote: RemoteOutcome;
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

/** Kebab-case a name (`My Demo` → `my-demo`), for derived repo names. */
function kebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
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

export interface CompletionItem {
  value: string;
  label: string;
  description?: string;
}

/**
 * Tab-completion for `/scafstak` args.
 *
 * `argumentText` is everything after the command name, as pi passes it. The
 * returned items replace the entire argument text, so version suggestions must
 * carry the stack prefix. Returns `null` when nothing sensible can complete.
 */
export async function completeArgs(
  templatesDir: string,
  argumentText: string,
): Promise<CompletionItem[] | null> {
  let stacks: StackInfo[];
  try {
    stacks = await listStacks(templatesDir);
  } catch {
    return null;
  }

  const tokens = argumentText
    .trimEnd()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  const trailingSpace = /\s$/.test(argumentText);

  // First argument — the stack name (possibly mid-word, or just a space).
  // `new-stack` (ticket #11) is offered as an authoring subcommand.
  if (tokens.length === 0 || (tokens.length === 1 && !trailingSpace)) {
    const prefix = tokens[0] ?? "";
    const matches = stacks.filter((s) => s.stack.startsWith(prefix));
    if (prefix.length > 0 && "new-stack".startsWith(prefix)) {
      return [{ value: "new-stack", label: "new-stack" }];
    }
    if (matches.length === 0) return null;
    return matches.map((s) => ({ value: s.stack, label: s.stack }));
  }

  // Second argument — a version of the stack named by the first token.
  if (tokens.length === 1 || (tokens.length === 2 && !trailingSpace)) {
    const stack = stacks.find((s) => s.stack === tokens[0]);
    if (!stack) return null;
    const prefix = tokens[1] ?? "";
    const matches = stack.versions.filter((v) => v.startsWith(prefix));
    if (matches.length === 0) return null;
    return matches.map((v) => ({ value: `${stack.stack} ${v}`, label: v }));
  }

  return null;
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
    requested === undefined
      ? undefined
      : stacks.find((s) => s.stack === requested);
  if (!stack) {
    if (requested !== undefined) {
      throw new Error(
        `unknown stack "${requested}" (known: ${stacks.map((s) => s.stack).join(", ")})`,
      );
    }
    const chosen = await ui.select(
      "Choose a stack:",
      stacks.map((s) => s.stack),
    );
    if (chosen === undefined) throw new WizardCancelled("no stack picked");
    const found = stacks.find((s) => s.stack === chosen);
    if (!found) throw new WizardCancelled("no stack picked");
    stack = found;
  }

  let version: string;
  if (stack.versions.length > 1) {
    const requestedVersion = config.args[1];
    if (
      requestedVersion !== undefined &&
      stack.versions.includes(requestedVersion)
    ) {
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
    if (only === undefined)
      throw new WizardCancelled(`stack "${stack.stack}" has no versions`);
    version = only;
  }

  return {
    version,
    templateDir: join(config.templatesDir, stack.stack, version),
  };
}

/**
 * Ask the single text question (Project name), derive the target dir, and
 * resolve the template questionnaire silently from defaults (#23).
 *
 * Every template question with a `default` is answered from that default;
 * one with no default fails loudly via `resolvedAnswers` rather than
 * prompting — the wizard stays one-question for well-formed templates.
 */
async function collectAnswers(
  ui: WizardUi,
  manifest: Manifest,
): Promise<{ resolved: Record<string, string> }> {
  const projectName = await ui.input("Project name");
  if (projectName === undefined) throw new WizardCancelled("no project name");
  const name = projectName.trim();
  if (name.length === 0) throw new WizardCancelled("no project name");

  const resolved = resolvedAnswers(manifest, {
    project_name: name,
    target_dir: `.${sep}${name}`,
  });
  return { resolved };
}

/** Human-readable manifest summary for the confirm dialog. */
function summarize(
  manifest: Manifest,
  resolved: Record<string, string>,
  destDir: string,
): string {
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

  if (
    !(await ui.confirm(
      "Scaffold project?",
      summarize(manifest, resolved, destDir),
    ))
  ) {
    throw new WizardCancelled("summary declined");
  }

  const vars = resolveVariables(manifest, resolved);
  const scaffolded = await ui.runInProgress(
    "Scaffolding project files…",
    async () => {
      const s = await scaffold(manifest, templateDir, vars, destDir);
      await initAndCommit(destDir);
      return s;
    },
  );

  // Ticket #9: remote question after the first commit. "None" is the
  // default — a cancel/decline amounts to no remote.
  const remoteChoice = await ui.select("Remote after first commit:", [
    "None (no remote)",
    "Add an existing URL",
    "Create a GitHub repo via gh and push",
  ]);

  let remote: RemoteOutcome = { choice: "none" };
  if (remoteChoice === "Add an existing URL") {
    const url = await ui.input("Existing remote URL");
    if (url === undefined) throw new WizardCancelled("no remote URL");
    const trimmed = url.trim();
    if (trimmed.length === 0) {
      throw new WizardCancelled("empty remote URL");
    }
    await ui.runInProgress("Pushing to remote…", () =>
      addAndPush(destDir, trimmed),
    );
    remote = { choice: "url", url: trimmed };
  } else if (remoteChoice === "Create a GitHub repo via gh and push") {
    const repoName = kebabCase(
      resolved.project_name ?? basename(resolve(destDir)),
    );
    const visibilityChoice =
      (await ui.select("GitHub repo visibility:", ["Private", "Public"])) ??
      "Private";
    const visibility = visibilityChoice === "Public" ? "public" : "private";
    await ui.runInProgress("Creating GitHub repo and pushing…", () =>
      createGitHubRepo(destDir, repoName, visibility),
    );
    remote = { choice: "gh", repoName, visibility };
  }

  const choice = await ui.select("Verify degree:", [
    "Light (toolchain check)",
    "Full (build)",
    "skip",
  ]);
  let depth: VerifyDepth = "light";
  if (choice === "Full (build)") depth = "full";
  else if (choice === "skip") depth = "skip";
  const runLabel =
    depth === "skip" ? "Verifying (none to run)…" : `Verifying (${depth})…`;
  const verification = await ui.runInProgress(runLabel, () =>
    verify(manifest, destDir, depth),
  );

  return {
    manifest,
    destDir,
    vars,
    files: scaffolded.files,
    verification,
    remote,
  };
}
