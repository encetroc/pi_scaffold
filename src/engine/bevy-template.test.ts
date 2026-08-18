/**
 * Integration tests for the real Bevy 0.19 template (templates/bevy/0.19).
 *
 * Per the design's testing decisions, the shipped templates are fixtures for
 * integration cases: substitution, FOUNDATION artifacts, and dry-run. The
 * full `cargo check` dry-run is intentionally NOT part of vitest (a Bevy
 * dependency build takes minutes); it runs as acceptance evidence on the
 * dev machine (ticket #5).
 */

import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadManifest, scaffold } from "./scaffold.js";
import { resolveQuestions, resolvedAnswers } from "./questions.js";
import { resolveVariables } from "./variables.js";

let tempRoot: string;
const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "scafstak-bevy-"));
  tempDirs.push(dir);
  return dir;
}

beforeEach(async () => {
  tempRoot = await makeTempDir();
});

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

const templateDir = join(process.cwd(), "templates", "bevy", "0.19");

describe("bevy/0.19 template", () => {
  it("loads and validates", () => {
    const manifest = loadManifest(templateDir);
    expect(manifest.stack).toBe("bevy");
    expect(manifest.frameworkVersion).toBe("0.19");
    expect(manifest.language).toBe("rust");
    expect(manifest.buildTargets).toEqual(["native", "web"]);
  });

  it("resolves questions and defaults for the happy path", () => {
    const manifest = loadManifest(templateDir);
    const questions = resolveQuestions(manifest, { project_name: "My Game" });

    expect(questions.map((q) => q.id)).toEqual([
      "window_title",
      "crate_name",
      "build_target",
    ]);
    const byId = Object.fromEntries(questions.map((q) => [q.id, q]));
    expect(byId.window_title!.value).toBe("My Game");
    expect(byId.crate_name!.value).toBe("my_game"); // snake_case of project name
    expect(byId.build_target!.value).toBe("native"); // default
  });

  it("scaffolds the full tree with substitution, foundation, and exec bits", async () => {
    const manifest = loadManifest(templateDir);
    const answers = resolvedAnswers(manifest, { project_name: "Bevy Demo" });
    const vars = resolveVariables(manifest, answers);

    const destDir = await makeTempDir();
    const result = await scaffold(manifest, templateDir, vars, destDir);

    // Template files, substituted.
    expect(result.files).toContain("Cargo.toml");
    expect(result.files).toContain("src/main.rs");
    expect(result.files).toContain("scripts/run.sh");
    expect(result.files).toContain("scripts/test.sh");

    const cargo = await readFile(join(destDir, "Cargo.toml"), "utf8");
    expect(cargo).toContain('name = "bevy_demo"');
    expect(cargo).toContain('bevy = "=0.19.1"');

    const main = await readFile(join(destDir, "src", "main.rs"), "utf8");
    expect(main).toContain('title: "Bevy Demo".to_string()');
    expect(main).not.toContain("{{");

    const run = await readFile(join(destDir, "scripts", "run.sh"), "utf8");
    expect(run).toContain("exec cargo run"); // native default target
    expect(run).not.toContain("{{build_target}}");

    // Executable modes preserved.
    const mode = (await stat(join(destDir, "scripts", "run.sh"))).mode & 0o777;
    expect(mode).toBe(0o755);

    // FOUNDATION artifacts generated on top.
    expect(result.files).toContain("AGENTS.md");
    expect(result.files).toContain("docs/vision.md");
    expect(result.files).toContain("tickets.md");
    expect(result.files).toContain("tests/eyeball/checklist.md");

    const agents = await readFile(join(destDir, "AGENTS.md"), "utf8");
    expect(agents).toContain("# Bevy Demo");
    expect(agents).toContain("**bevy 0.19**");
    expect(agents).toContain("Build targets: native, web");
    // Getting-started embedded as the Setup section, cited.
    expect(agents).toContain("## Setup");
    expect(agents).toContain("bevy.org/learn/quick-start/getting-started/setup");
    expect(agents).toContain("libasound2-dev");
    expect(agents).toContain("cargo -j 8");
    expect(agents).toContain("WSLg");
  });

  it("substitutes the web build target into run.sh", async () => {
    const manifest = loadManifest(templateDir);
    const answers = resolvedAnswers(manifest, {
      project_name: "Web Game",
      build_target: "web",
    });
    const vars = resolveVariables(manifest, answers);

    const destDir = await makeTempDir();
    await scaffold(manifest, templateDir, vars, destDir);

    const run = await readFile(join(destDir, "scripts", "run.sh"), "utf8");
    // Condition substituted to the chosen target; trunk branch selected.
    expect(run).toContain('[ "web" = "web" ]');
    expect(run).toContain("exec trunk serve");
    // Unsubstituted placeholder must not leak.
    expect(run).not.toContain("{{build_target}}");
  });
});
