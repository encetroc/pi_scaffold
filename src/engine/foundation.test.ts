import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FoundationError, generateFoundation } from "./foundation.js";
import { loadManifest, scaffold } from "./scaffold.js";
import { resolveVariables } from "./variables.js";

let tempRoot: string;
const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "scafstak-"));
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

const fixturesDir = join(process.cwd(), "test", "fixtures", "minimal");
const answers = {
  project_name: "My Game",
  window_title: "My Game",
  crate_name: "my_game",
};

/** Minimal fixture + FOUNDATION layer, as one full scaffold (default options). */
const FOUNDATION_FILES = [
  ".gitignore",
  "AGENTS.md",
  "docs/architecture.md",
  "docs/decisions/README.md",
  "docs/playtests/README.md",
  "docs/research/README.md",
  "docs/specs/README.md",
  "docs/vision.md",
  "tests/README.md",
  "tests/eyeball/checklist.md",
  "tests/headless/.gitkeep",
  "tests/unit/.gitkeep",
  "tickets.md",
];

describe("generateFoundation", () => {
  it("writes the complete docs tree, AGENTS.md, tickets.md, .gitignore, harness stub", async () => {
    const manifest = loadManifest(fixturesDir);
    const vars = resolveVariables(manifest, answers);
    const destDir = await makeTempDir();

    const files = (
      await generateFoundation(manifest, fixturesDir, vars, destDir)
    ).sort();

    expect(files).toEqual(FOUNDATION_FILES);

    for (const [dir, hint] of [
      ["research", "RESEARCH step"],
      ["specs", "SPECS step"],
      ["decisions", "Append-only"],
      ["playtests", "PLAYTEST"],
    ] as const) {
      const readme = await readFile(
        join(destDir, "docs", dir, "README.md"),
        "utf8",
      );
      expect(readme).toContain(hint);
    }
    expect(
      await readFile(join(destDir, "docs", "vision.md"), "utf8"),
    ).toContain("VISION step");
    expect(
      await readFile(join(destDir, "docs", "architecture.md"), "utf8"),
    ).toContain("ARCHITECTURE step");
  });

  it("AGENTS.md embeds stack, commands, conventions, docs map, workflow pointer", async () => {
    const manifest = loadManifest(fixturesDir);
    const vars = resolveVariables(manifest, answers);
    const destDir = await makeTempDir();
    await generateFoundation(manifest, fixturesDir, vars, destDir);

    const agents = await readFile(join(destDir, "AGENTS.md"), "utf8");
    expect(agents).toContain("# My Game");
    expect(agents).toContain("teststack 1.0");
    expect(agents).toContain("(rust)");
    expect(agents).toContain("`./scripts/run.sh`");
    expect(agents).toContain("`./scripts/test.sh`");
    expect(agents).toContain("## Conventions");
    expect(agents).toContain("three layers");
    expect(agents).toContain("## Docs map");
    expect(agents).toContain("docs/research/");
    expect(agents).toContain("## Workflow");
    expect(agents).toContain("commit per ticket");
  });

  it("embeds the template getting-started as a Setup section, variables substituted", async () => {
    const manifest = loadManifest(fixturesDir);
    const vars = resolveVariables(manifest, answers);
    const destDir = await makeTempDir();
    await generateFoundation(manifest, fixturesDir, vars, destDir);

    const agents = await readFile(join(destDir, "AGENTS.md"), "utf8");
    expect(agents).toContain("## Setup");
    expect(agents).toContain("Project name: **My Game**");
  });

  it("omits the Setup section when no getting-started exists and none is declared", async () => {
    const tplDir = await makeTempDir();
    await writeFile(
      join(tplDir, "manifest.json"),
      JSON.stringify({
        name: "nostub",
        stack: "s",
        frameworkVersion: "1",
        language: "sh",
      }),
    );
    const manifest = loadManifest(tplDir);
    const destDir = await makeTempDir();
    await generateFoundation(manifest, tplDir, { project_name: "X" }, destDir);

    const agents = await readFile(join(destDir, "AGENTS.md"), "utf8");
    expect(agents).not.toContain("## Setup");
  });

  it("errors loudly when the manifest declares a missing gettingStarted file", async () => {
    const tplDir = await makeTempDir();
    await writeFile(
      join(tplDir, "manifest.json"),
      JSON.stringify({
        name: "declared",
        stack: "s",
        frameworkVersion: "1",
        language: "sh",
        gettingStarted: "setup/guide.md",
      }),
    );
    const manifest = loadManifest(tplDir);
    await expect(
      generateFoundation(manifest, tplDir, {}, tempRoot),
    ).rejects.toThrow(FoundationError);
    await expect(
      generateFoundation(manifest, tplDir, {}, tempRoot),
    ).rejects.toThrow(/gettingStarted/);
  });

  it("reads a custom gettingStarted filename from the manifest", async () => {
    const tplDir = await makeTempDir();
    await writeFile(
      join(tplDir, "manifest.json"),
      JSON.stringify({
        name: "custom",
        stack: "s",
        frameworkVersion: "1",
        language: "sh",
        gettingStarted: "setup/guide.md",
      }),
    );
    await mkdir(join(tplDir, "setup"), { recursive: true });
    await writeFile(
      join(tplDir, "setup", "guide.md"),
      "Custom setup for **{{project_name}}**.\n",
    );

    const manifest = loadManifest(tplDir);
    const destDir = await makeTempDir();
    await generateFoundation(manifest, tplDir, { project_name: "Y" }, destDir);

    const agents = await readFile(join(destDir, "AGENTS.md"), "utf8");
    expect(agents).toContain("## Setup");
    expect(agents).toContain("Custom setup for **Y**.");
  });

  it("errors loudly on unknown variables inside the getting-started content", async () => {
    const tplDir = await makeTempDir();
    await writeFile(
      join(tplDir, "manifest.json"),
      JSON.stringify({
        name: "badvar",
        stack: "s",
        frameworkVersion: "1",
        language: "sh",
      }),
    );
    await writeFile(
      join(tplDir, "getting-started.md"),
      "Needs {{missing_var}}.\n",
    );

    const manifest = loadManifest(tplDir);
    await expect(
      generateFoundation(manifest, tplDir, { project_name: "X" }, tempRoot),
    ).rejects.toThrow(/unknown variable "\{\{missing_var\}\}"/);
  });
});

describe("scaffold artifact set (ticket #3 acceptance)", () => {
  it("scaffolded fixture ships the complete FOUNDATION artifact set", async () => {
    const manifest = loadManifest(fixturesDir);
    const vars = resolveVariables(manifest, answers);
    const destDir = await makeTempDir();

    const result = await scaffold(manifest, fixturesDir, vars, destDir);

    expect(result.files.sort()).toEqual(
      [
        "README.md",
        "my_game/config.txt",
        "scripts/run.sh",
        "scripts/test.sh",
        "src/main.rs",
        ...FOUNDATION_FILES,
      ].sort(),
    );
  });

  it("scripts/run.sh and scripts/test.sh are executable in the scaffolded tree", async () => {
    const manifest = loadManifest(fixturesDir);
    const vars = resolveVariables(manifest, answers);
    const destDir = await makeTempDir();
    await scaffold(manifest, fixturesDir, vars, destDir);

    for (const script of ["run.sh", "test.sh"]) {
      const mode = (await stat(join(destDir, "scripts", script))).mode & 0o777;
      expect(mode).toBe(0o755);
      const content = await readFile(join(destDir, "scripts", script), "utf8");
      expect(content).toContain("#!/bin/sh");
    }
  });

  it("AGENTS.md embeds the template getting-started and resolves variables", async () => {
    const manifest = loadManifest(fixturesDir);
    const vars = resolveVariables(manifest, answers);
    const destDir = await makeTempDir();
    await scaffold(manifest, fixturesDir, vars, destDir);

    const agents = await readFile(join(destDir, "AGENTS.md"), "utf8");
    expect(agents).toContain("## Setup");
    expect(agents).toContain("Project name: **My Game**");
  });

  it("tickets.md and .gitignore are present with expected content", async () => {
    const manifest = loadManifest(fixturesDir);
    const vars = resolveVariables(manifest, answers);
    const destDir = await makeTempDir();
    await scaffold(manifest, fixturesDir, vars, destDir);

    const tickets = await readFile(join(destDir, "tickets.md"), "utf8");
    expect(tickets).toContain("Backlog");
    const gitignore = await readFile(join(destDir, ".gitignore"), "utf8");
    expect(gitignore).toContain("node_modules/");
    expect(gitignore).toContain(".DS_Store");
  });
});
