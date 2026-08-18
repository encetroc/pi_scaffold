/**
 * FOUNDATION artifact generation (pure — no pi APIs, per ADR 0004).
 *
 * Every scaffolded project ships the FOUNDATION context layer per
 * foundation.md: the `docs/` tree, `AGENTS.md`, `tickets.md`, `.gitignore`,
 * and the 3-layer test harness stub. These artifacts are engine-generated
 * and manifest-driven (ADR 0001): stack/commands come from the manifest,
 * the getting-started Setup section comes from the template's
 * `getting-started.md` (or the file named by `manifest.gettingStarted`).
 *
 * Stack-specific files (game code, `scripts/run.sh` / `scripts/test.sh`
 * with real launch commands, toolchain config) stay in the template's
 * `files/` tree — the engine copies them and preserves executable modes,
 * but never invents stack-specific content.
 *
 * Engine-generated paths are authoritative: if a template's `files/` also
 * ships one of these paths, the generated artifact overwrites it.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Manifest } from "./manifest.js";
import { toPosix } from "./path.js";
import { substituteTemplate } from "./variables.js";

export class FoundationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FoundationError";
  }
}

const DEFAULT_GETTING_STARTED = "getting-started.md";

const DOCS_READMES: Record<string, string> = {
  research:
    "Findings from the RESEARCH step land here: cited sources, evidence, and go/no-go verdicts.",
  specs: "One testable spec per feature — the SPECS step output.",
  decisions:
    "Architecture decision records (context → decision → consequences). Append-only: never rewrite, only add.",
  playtests:
    "Feel/balance notes from PLAYTEST sessions: what was tried, what worked, what didn't.",
};

const DOCS_MAP_LINES = [
  "- `docs/research/` — cited findings + go/no-go verdicts (RESEARCH step)",
  "- `docs/specs/` — one testable spec per feature (SPECS step)",
  "- `docs/decisions/` — ADRs: context → decision → consequences (ARCHITECTURE step)",
  "- `docs/playtests/` — feel/balance notes (PLAYTEST step)",
  "- `docs/vision.md` — one-page game design document (VISION step)",
  "- `docs/architecture.md` — system design (ARCHITECTURE step)",
];

const GITIGNORE = [
  "# build artifacts",
  "node_modules/",
  "target/",
  "dist/",
  "build/",
  "",
  "# logs + OS noise",
  "*.log",
  ".DS_Store",
  "",
].join("\n");

const TICKETS_MD = [
  "# Backlog",
  "",
  "Empty backlog — the TICKETS step fills it with vertical slices.",
  "Commit per ticket; reference the ticket in the commit message.",
  "",
].join("\n");

const HARNESS_README = [
  "# Test harness",
  "",
  "Three layers, run by `./scripts/test.sh`:",
  "",
  "- `tests/unit/` — pure logic tests, no game boot (framework per stack: vitest, cargo test, …)",
  "- `tests/headless/` — boot smoke checks: game starts, no crash (jsdom for Phaser, fengari for LÖVE, …)",
  "- `tests/eyeball/` — manual run checklist: window opens, runs, feels right",
  "",
  "Add cases under the right layer. `./scripts/test.sh` must stay green.",
  "",
].join("\n");

const EYEBALL_CHECKLIST = [
  "# Eyeball checklist",
  "",
  "Manual pass: run `./scripts/run.sh` and confirm:",
  "",
  "- [ ] Game window opens",
  "- [ ] No crash on start",
  "- [ ] Core loop runs",
  "",
  "Add stack-specific checks here.",
  "",
].join("\n");

const VISION_STUB =
  "# Vision\n\nOne-page game design document — filled by the VISION step.\n";
const ARCHITECTURE_STUB =
  "# Architecture\n\nSystem design — filled by the ARCHITECTURE step.\n";

/**
 * Build the scaffolded `AGENTS.md` body. Stack/commands/docs-map are filled
 * from the manifest; the setup section embeds the template's getting-started.
 * `{{project_name}}` is left literal so it resolves through the shared
 * variable table (along with any variables inside the getting-started text).
 */
function buildAgentsMd(manifest: Manifest, setup: string | undefined): string {
  const lines: string[] = [
    "# {{project_name}}",
    "",
    "## Stack",
    "",
    `- Engine: **${manifest.stack} ${manifest.frameworkVersion}** (${manifest.language})`,
  ];
  if (manifest.buildTargets && manifest.buildTargets.length > 0) {
    lines.push(`- Build targets: ${manifest.buildTargets.join(", ")}`);
  }

  const commands: string[] = [];
  if (manifest.commands?.run)
    commands.push(`- **Run** — \`${manifest.commands.run}\``);
  if (manifest.commands?.test)
    commands.push(`- **Test** — \`${manifest.commands.test}\``);
  if (commands.length > 0) {
    lines.push("", "## Commands", "", ...commands);
  }

  lines.push(
    "",
    "## Conventions",
    "",
    "- Tests are three layers: `tests/unit/` (pure logic), `tests/headless/` (boot smoke), `tests/eyeball/` (manual run checklist)",
    "- `docs/decisions/` is append-only — never rewrite entries",
    "",
    "## Docs map",
    "",
    ...DOCS_MAP_LINES,
    "",
    "## Workflow",
    "",
    "Pipeline: FOUNDATION → RESEARCH → VISION → PROTOTYPE → ARCHITECTURE → … " +
      "Read `docs/` before editing; commit per ticket; `./scripts/test.sh` must stay green.",
  );

  if (setup !== undefined) {
    lines.push("", "## Setup", "", setup.trimEnd());
  }

  return lines.join("\n") + "\n";
}

/**
 * Load the template's getting-started content for the AGENTS.md Setup
 * section. A manifest-declared file that is missing errors loudly; the
 * default `getting-started.md` is omitted silently when absent.
 */
async function loadSetupSection(
  manifest: Manifest,
  templateDir: string,
): Promise<string | undefined> {
  const declared = manifest.gettingStarted;
  const relPath = declared ?? DEFAULT_GETTING_STARTED;
  const fullPath = join(templateDir, relPath);

  try {
    return await readFile(fullPath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      if (declared !== undefined) {
        throw new FoundationError(
          `manifest declares gettingStarted "${relPath}" but ${fullPath} is missing`,
        );
      }
      return undefined;
    }
    throw new FoundationError(
      `cannot read getting-started at ${fullPath}: ${(err as Error).message}`,
    );
  }
}

/**
 * Write the FOUNDATION context layer into `destDir`: docs tree, AGENTS.md,
 * tickets.md, .gitignore, and the 3-layer test harness stub. Returns the
 * written relative paths (posix-style), in write order.
 *
 * The full AGENTS.md body (including the embedded getting-started) passes
 * through the shared variable table, so unknown `{{var}}` references error
 * loudly, same as template files.
 */
export async function generateFoundation(
  manifest: Manifest,
  templateDir: string,
  vars: Record<string, string>,
  destDir: string,
): Promise<string[]> {
  const written: string[] = [];

  async function write(relPath: string, content: string): Promise<void> {
    const destPath = join(destDir, relPath);
    await mkdir(join(destPath, ".."), { recursive: true });
    await writeFile(destPath, content, "utf8");
    written.push(toPosix(relPath));
  }

  const setup = await loadSetupSection(manifest, templateDir);
  const agentsMd = substituteTemplate(
    buildAgentsMd(manifest, setup),
    vars,
    "AGENTS.md",
  );
  await write("AGENTS.md", agentsMd);

  for (const [dir, purpose] of Object.entries(DOCS_READMES)) {
    await write(`docs/${dir}/README.md`, `# ${dir}\n\n${purpose}\n`);
  }
  await write("docs/vision.md", VISION_STUB);
  await write("docs/architecture.md", ARCHITECTURE_STUB);

  await write("tickets.md", TICKETS_MD);
  await write(".gitignore", GITIGNORE);

  await write("tests/README.md", HARNESS_README);
  await write("tests/unit/.gitkeep", "");
  await write("tests/headless/.gitkeep", "");
  await write("tests/eyeball/checklist.md", EYEBALL_CHECKLIST);

  return written;
}
