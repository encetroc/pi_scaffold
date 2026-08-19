/**
 * `/scafstak new-stack` — the AI authoring flow (ticket #11).
 *
 * One command starts a new template: the skeleton is created through the
 * pure engine (`newTemplate`, ticket #10), then the extension kicks the
 * agent itself via `pi.sendUserMessage` to research the declared
 * references, fill `files/`, write the cited `getting-started.md`, and
 * dry-run verify (scafstak_verify_template). The user reviews and commits
 * the result — nothing is committed by this flow.
 *
 * All user interaction goes through the same `WizardUi` seam as the happy
 * path so the flow stays testable with a scripted fake.
 */

import {
  newTemplate,
  type Manifest,
} from "../../src/engine/index.js";

import {
  WizardCancelled,
  type WizardUi,
} from "./wizard.js";

export interface NewStackConfig {
  /** Root directory containing `<stack>/<version>/manifest.json` trees. */
  templatesDir: string;
  /**
   * Parsed args after the `new-stack` subcommand:
   * `[stack]? [version]? [language]?` — prefill the prompts when present.
   */
  args: string[];
}

export interface NewStackResult {
  /** Absolute path of the created template dir. */
  templateDir: string;
  manifest: Manifest;
  /** The user message that hands the authoring task to the agent. */
  kickoff: string;
}

/** Trim + collapse whitespace; empty becomes undefined. */
function arg(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * One required prompt, backed by a command arg as the prefill. When the
 * arg is present it is taken as-is (no re-prompt, same as the happy path's
 * arg preselect); missing args are prompted for and must be non-empty.
 */
async function askFor(
  ui: WizardUi,
  prompt: string,
  prefill?: string,
): Promise<string> {
  if (prefill !== undefined) return prefill;
  const value = await ui.input(prompt);
  if (value === undefined) throw new WizardCancelled("new-stack cancelled");
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new WizardCancelled(`no ${prompt.toLowerCase()} given`);
  return trimmed;
}

/**
 * Build the agent handoff message for a fresh template skeleton. Written
 * for the same agent session to continue: research → fill → cite → verify.
 */
export function buildKickoff(result: Pick<NewStackResult, "templateDir" | "manifest">): string {
  const m = result.manifest;
  const declaredRefs = m.references ?? [];
  const references =
    declaredRefs.length > 0
      ? declaredRefs.map((r) => `  - ${r}`).join("\n")
      : "  (none declared — find the official docs yourself)";
  const pair = result.templateDir.split(/[\\/]/).slice(-2).join("/");
  return [
    `[scafstak new-stack handoff] Author the new scafstak template at \`${result.templateDir}\`.`,
    ``,
    `Stack: ${m.stack} ${m.frameworkVersion} (template ${m.language}, manifest ${m.name})`,
    `References:`,
    references,
    ``,
    `Task — no template lands unverified:`,
    ``,
    `1. Research. Fetch the official docs for ${m.stack} pinned at version ${m.frameworkVersion} ` +
      `(use fetch_content / web_search on official documentation; prefer official guides over ` +
      `third-party posts). Record source URLs — they become the getting-started citations.`,
    `2. Fill \`files/\`. Build a minimal, working project skeleton under the template's \`files/\` dir. ` +
      `Mirror the structure of the shipped templates (\`templates/bevy/0.19\`, \`templates/phaser/4\`). ` +
      `Templatize: the manifest's questions/variables drive \`{{var}}\` substitution — keep variable ` +
      `names meaningful and defaultable. Include run/test scripts per repo conventions.`,
    `3. Write \`getting-started.md\`. System deps, setup steps, canonical run/test commands, platform ` +
      `quirks (e.g. WSL). Cite official docs inline as markdown links.`,
    `4. Dry-run verify. Call \`scafstak_verify_template\` with "${pair}" (stack/version dir pair). ` +
      `Iterate (fix files, manifest, or getting-started) until it PASSES. If it cannot pass, ` +
      `report the failures back and stop — do not mark the template complete.`,
    `5. Do NOT commit and do NOT scaffold into the user's project. The user reviews the template ` +
      `and commits the result.`,
    ``,
    `Repo conventions: read \`CONTEXT.md\` and \`docs/agents/domain.md\`; follow the engineering ` +
    `skills in \`.agents/skills/\` (writing-for-agents for the getting-started, tdd where it applies).`,
  ].join("\n");
}

/**
 * Run the new-stack authoring flow: prompt (or take from args) stack /
 * version / language / references, create the skeleton, and return the
 * agent kickoff message. Throws `WizardCancelled` when the user backs out;
 * the caller reports the result and delivers the kickoff.
 */
export async function runNewStack(
  ui: WizardUi,
  config: NewStackConfig,
): Promise<NewStackResult> {
  const stack = await askFor(ui, "Stack name (e.g. bevy)", arg(config.args[0]));
  const version = await askFor(ui, "Version directory (e.g. 0.20)", arg(config.args[1]));
  const language = await askFor(ui, "Language (e.g. rust, javascript)", arg(config.args[2]));

  const referencesInput = await ui.input(
    "Authoring references (comma-separated doc URLs or md paths — optional)",
    "",
  );
  if (referencesInput === undefined) throw new WizardCancelled("new-stack cancelled");
  const references = referencesInput
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);

  const result = await newTemplate({
    templatesDir: config.templatesDir,
    stack,
    version,
    language,
    references,
  });

  const full: NewStackResult = {
    templateDir: result.templateDir,
    manifest: result.manifest,
    kickoff: buildKickoff(result),
  };
  return full;
}