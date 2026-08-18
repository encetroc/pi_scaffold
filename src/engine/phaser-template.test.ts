/**
 * Integration tests for the real Phaser 4 template (templates/phaser/4).
 *
 * Per the design's testing decisions, the shipped templates are fixtures for
 * integration cases: substitution, FOUNDATION artifacts, and dry-run. The
 * full `npm install + build` dry-run is intentionally NOT part of vitest
 * (it needs network + a real npm install); it runs as acceptance evidence
 * on the dev machine (ticket #6).
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
  const dir = await mkdtemp(join(tmpdir(), "scafstak-phaser-"));
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

const templateDir = join(process.cwd(), "templates", "phaser", "4");

describe("phaser/4 template", () => {
  it("loads and validates", () => {
    const manifest = loadManifest(templateDir);
    expect(manifest.stack).toBe("phaser");
    expect(manifest.frameworkVersion).toBe("4");
    expect(manifest.language).toBe("javascript");
    expect(manifest.buildTargets).toEqual(["web"]);
  });

  it("resolves questions and defaults for the happy path", () => {
    const manifest = loadManifest(templateDir);
    const questions = resolveQuestions(manifest, { project_name: "My Game" });

    expect(questions.map((q) => q.id)).toEqual([
      "game_title",
      "canvas_width",
      "canvas_height",
      "package_name",
    ]);
    const byId = Object.fromEntries(questions.map((q) => [q.id, q]));
    expect(byId.game_title!.value).toBe("My Game");
    expect(byId.canvas_width!.value).toBe("960"); // default
    expect(byId.canvas_height!.value).toBe("480"); // default
    expect(byId.package_name!.value).toBe("my-game"); // kebab-case of project name
  });

  it("scaffolds the full tree with substitution, foundation, and exec bits", async () => {
    const manifest = loadManifest(templateDir);
    const answers = resolvedAnswers(manifest, { project_name: "Phaser Demo" });
    const vars = resolveVariables(manifest, answers);

    const destDir = await makeTempDir();
    const result = await scaffold(manifest, templateDir, vars, destDir);

    // Template files, substituted.
    expect(result.files).toContain("package.json");
    expect(result.files).toContain("src/main.js");
    expect(result.files).toContain("scripts/run.sh");
    expect(result.files).toContain("scripts/test.sh");
    expect(result.files).toContain("vite.config.js");

    const pkg = await readFile(join(destDir, "package.json"), "utf8");
    expect(pkg).toContain('"name": "phaser-demo"');
    expect(pkg).toContain('"phaser": "^4.2.1"');

    const main = await readFile(join(destDir, "src", "main.js"), "utf8");
    expect(main).toContain('Number("960")'); // canvas width substituted
    expect(main).toContain('Number("480")');
    expect(main).toContain("createCursorKeys"); // moving sprite input
    expect(main).not.toContain("{{");

    const vite = await readFile(join(destDir, "vite.config.js"), "utf8");
    expect(vite).toContain("host: true"); // Windows browser can reach WSL
    expect(vite).toContain("port: 8080");

    // Executable modes preserved.
    const mode = (await stat(join(destDir, "scripts", "run.sh"))).mode & 0o777;
    expect(mode).toBe(0o755);

    // FOUNDATION artifacts generated on top.
    expect(result.files).toContain("AGENTS.md");
    expect(result.files).toContain("docs/vision.md");
    expect(result.files).toContain("tickets.md");
    expect(result.files).toContain("tests/eyeball/checklist.md");

    const agents = await readFile(join(destDir, "AGENTS.md"), "utf8");
    expect(agents).toContain("# Phaser Demo");
    expect(agents).toContain("**phaser 4**");
    expect(agents).toContain("Build targets: web");
    // Getting-started embedded as the Setup section, cited.
    expect(agents).toContain("## Setup");
    expect(agents).toContain("Install Node.js 24");
    expect(agents).toContain("server.host=true");
    expect(agents).toContain("nodejs.org/en/download");
  });
});
