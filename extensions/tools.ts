/**
 * Scafstak authoring tools (ticket #10): `scafstak_list`,
 * `scafstak_new_template`, `scafstak_verify_template`.
 *
 * These are thin wrappers around the pure engine (ADR 0004): registry
 * discovery, skeleton creation + harvest, and dry-run verification all live
 * in `src/engine/`. The tools resolve the templates root the same way the
 * `/scafstak` command does (`templateRoot`, `SCAFSTAK_TEMPLATES` override)
 * and shape engine results (including loud failures) for the agent.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { Type } from "typebox";

import {
  dryRunTemplate,
  listTemplates,
  newTemplate,
  type Manifest,
  type TemplateEntry,
  type TemplateProblem,
  type VerifyCheckResult,
} from "../src/engine/index.js";

import { templateRoot } from "./lib/root.js";

/** Uniform `details` shapes so every branch of each tool stays consistent. */
interface ListToolDetails {
  ok: boolean;
  error?: string;
  templates: TemplateEntry[];
  errors: TemplateProblem[];
}

interface NewTemplateToolDetails {
  ok: boolean;
  error?: string;
  templateDir?: string;
  manifest?: Manifest;
  harvestedFiles?: string[];
}

interface VerifyTemplateToolDetails {
  ok: boolean;
  error?: string;
  tempDir?: string;
  files?: string[];
  checks?: VerifyCheckResult[];
}

/** Format a run-as-command string with the truncated failure output. */
function checkLine(command: string, ok: boolean, output?: string): string {
  if (ok) return `- ${command}: passed`;
  return `- ${command}: FAILED${output ? `\n    ${output.replace(/\n/g, "\n    ")}` : ""}`;
}

/** One list line: "bevy 0.19 (rust) [build targets: native, web]". */
function templateLine(entry: TemplateEntry): string {
  const base = `- ${entry.stack} ${entry.version} (${entry.language})`;
  if (entry.buildTargets.length === 0) return base;
  return `${base} [build targets: ${entry.buildTargets.join(", ")}]`;
}

function registerListTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "scafstak_list",
    label: "Scafstak: list templates",
    description:
      "List every registered scafstak template: stack, framework version, language, and build targets. Broken manifests are reported as errors, never hidden.",
    promptSnippet: "List scafstak stacks, versions, languages, and build targets",
    promptGuidelines: [
      "Use scafstak_list before scafstak_new_template to check whether a stack/version already exists.",
    ],
    parameters: Type.Object({}),
    async execute() {
      const root = templateRoot(import.meta.url);
      try {
        const { templates, errors } = await listTemplates(root);
        const details: ListToolDetails = { ok: true, templates, errors };
        const lines = [
          `Scafstak templates in ${root}:`,
          ...(templates.length === 0
            ? ["  (none)"]
            : templates.map(templateLine)),
        ];
        if (errors.length > 0) {
          lines.push(
            "",
            `Broken templates (${errors.length}):`,
            ...errors.map((e) => `- ${e.template}: ${e.message}`),
          );
        }
        return { content: [{ type: "text", text: lines.join("\n") }], details };
      } catch (err) {
        const details: ListToolDetails = {
          ok: false,
          error: (err as Error).message,
          templates: [],
          errors: [],
        };
        return {
          content: [
            {
              type: "text",
              text: `scafstak_list failed: ${(err as Error).message}`,
            },
          ],
          details,
        };
      }
    },
  });
}

function registerNewTemplateTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "scafstak_new_template",
    label: "Scafstak: new template",
    description:
      "Create a new template skeleton at templates/<stack>/<version>/: a validated manifest.json, a getting-started.md placeholder, and a files/ tree. Optionally harvest an existing project into files/ (--source) and seed manifest references from docs (--docs). The agent then fills files/ and the getting-started guide from research.",
    promptSnippet: "Create a new scafstak template skeleton (optionally harvesting an existing project)",
    promptGuidelines: [
      "Use scafstak_new_template to start authoring a new stack or framework version; then fill files/ and getting-started.md from official docs and dry-run with scafstak_verify_template.",
      "When scafstak_new_template harvests with source, templatize the copied files (answers, {{var}} placeholders) before verifying.",
    ],
    parameters: Type.Object({
      stack: Type.String({
        description: "Tech stack name, e.g. \"bevy\" (also the templates/ subdirectory).",
      }),
      version: Type.String({
        description: "Template version directory, e.g. \"0.19\" (templates/<stack>/<version>/).",
      }),
      language: Type.String({
        description: "Implementation language, e.g. \"rust\" or \"javascript\".",
      }),
      frameworkVersion: Type.Optional(
        Type.String({
          description:
            "Manifest frameworkVersion (the pinned engine/library version). Defaults to version.",
        }),
      ),
      source: Type.Optional(
        Type.String({
          description:
            "Existing project path to harvest into files/ (build artifacts, .git and node_modules excluded).",
        }),
      ),
      docs: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Authoring doc sources for the getting-started guide: official doc URLs and/or local md file paths.",
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      const root = templateRoot(import.meta.url);
      try {
        const result = await newTemplate({
          templatesDir: root,
          stack: params.stack,
          version: params.version,
          language: params.language,
          frameworkVersion: params.frameworkVersion,
          references: params.docs,
          source: params.source,
        });
        const references = result.manifest.references ?? [];
        const details: NewTemplateToolDetails = {
          ok: true,
          templateDir: result.templateDir,
          manifest: result.manifest,
          harvestedFiles: result.harvestedFiles,
        };
        const lines = [
          `Created template ${params.stack}/${params.version} at ${result.templateDir}`,
          `- manifest.json (frameworkVersion: ${result.manifest.frameworkVersion}, language: ${result.manifest.language})`,
          `- getting-started.md placeholder`,
          result.harvestedFiles.length > 0
            ? `- files/: harvested ${result.harvestedFiles.length} file(s) from ${params.source}`
            : `- files/: empty — fill it from research, or re-create with source to harvest an existing project`,
          ...(references.length > 0
            ? [`- references (${references.length}): ${references.join(", ")}`]
            : []),
        ];
        return { content: [{ type: "text", text: lines.join("\n") }], details };
      } catch (err) {
        const details: NewTemplateToolDetails = {
          ok: false,
          error: (err as Error).message,
        };
        return {
          content: [
            {
              type: "text",
              text: `scafstak_new_template failed: ${(err as Error).message}`,
            },
          ],
          details,
        };
      }
    },
  });
}

function registerVerifyTemplateTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "scafstak_verify_template",
    label: "Scafstak: verify template",
    description:
      "Dry-run a template: scaffold it with default answers into a temp dir, run the manifest's verifyCheck and verifyBuild commands, and report pass/fail per command. Fails loudly on a broken manifest, a missing files/ tree, or an unanswered question.",
    promptSnippet: "Dry-run verify a scafstak template (scaffold + verify commands in a temp dir)",
    promptGuidelines: [
      "Use scafstak_verify_template after authoring or editing a template, before it ships — a template must dry-run PASS to be accepted.",
    ],
    parameters: Type.Object({
      template: Type.String({
        description: 'Template to verify as "<stack>/<version>", e.g. "bevy/0.19".',
      }),
    }),
    async execute(_toolCallId, params) {
      const root = templateRoot(import.meta.url);

      const segments = params.template.trim().split("/").filter((s) => s.length > 0);
      const [stack, version] = segments;
      const isSafe =
        segments.length === 2 &&
        segments.every((s) => s !== "." && s !== ".." && !s.includes("\0"));
      if (!isSafe || stack === undefined || version === undefined) {
        const details: VerifyTemplateToolDetails = {
          ok: false,
          error: `invalid template "${params.template}"`,
        };
        return {
          content: [
            {
              type: "text",
              text: `scafstak_verify_template failed: template must be "<stack>/<version>" (got "${params.template}")`,
            },
          ],
          details,
        };
      }

      const templateDir = join(root, stack, version);
      try {
        const result = await dryRunTemplate(templateDir);
        const checks = result.verification.checks;
        const status = result.verification.ok ? "PASS" : "FAIL";
        const details: VerifyTemplateToolDetails = {
          ok: result.verification.ok,
          tempDir: result.tempDir,
          files: result.files,
          checks,
        };
        const lines = [
          `scafstak_verify_template ${status} for ${segments.join("/")} (dry-run)`,
          `- scaffolded ${result.files.length} file(s) into ${result.tempDir}`,
          ...(checks.length === 0
            ? ["- no verify commands declared (verifyCheck / verifyBuild) — nothing ran"]
            : checks.map((c) => checkLine(c.command, c.ok, c.output))),
        ];
        return { content: [{ type: "text", text: lines.join("\n") }], details };
      } catch (err) {
        const details: VerifyTemplateToolDetails = {
          ok: false,
          error: (err as Error).message,
        };
        return {
          content: [
            {
              type: "text",
              text: `scafstak_verify_template FAIL for ${segments.join("/")}: ${(err as Error).message}`,
            },
          ],
          details,
        };
      }
    },
  });
}

export function registerAuthoringTools(pi: ExtensionAPI): void {
  registerListTool(pi);
  registerNewTemplateTool(pi);
  registerVerifyTemplateTool(pi);
}
