/**
 * Template authoring tests (#10): newTemplate creates a validated skeleton
 * (manifest + getting-started placeholder + files/), never clobbers an
 * existing template, and harvests an existing project into files/ excluding
 * build artifacts.
 */

import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthorError, harvestSource, newTemplate } from "./author.js";
import { parseManifest } from "./manifest.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "scafstak-author-"));
  tempDirs.push(dir);
  return dir;
}

let templatesDir: string;

beforeEach(async () => {
  templatesDir = await makeTempDir();
});

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

describe("newTemplate", () => {
  it("writes a manifest, a getting-started placeholder, and a files/ tree", async () => {
    const result = await newTemplate({
      templatesDir,
      stack: "bevy",
      version: "0.19",
      language: "rust",
    });

    expect(result.templateDir).toBe(join(templatesDir, "bevy", "0.19"));

    // The written manifest parses back through the same validator.
    const manifest = parseManifest(
      await readFile(join(result.templateDir, "manifest.json"), "utf8"),
    );
    expect(manifest.name).toBe("bevy-0.19");
    expect(manifest.stack).toBe("bevy");
    expect(manifest.frameworkVersion).toBe("0.19"); // defaults to version
    expect(manifest.language).toBe("rust");
    expect(manifest.gettingStarted).toBe("getting-started.md");
    expect(manifest.references).toEqual([]);

    const gettingStarted = await readFile(
      join(result.templateDir, "getting-started.md"),
      "utf8",
    );
    expect(gettingStarted).toContain("# bevy 0.19 — getting started");
    expect(gettingStarted).toContain("## Setup");

    // files/ exists and is empty (the agent fills it).
    expect(await readdir(join(result.templateDir, "files"))).toEqual([]);
    expect(result.harvestedFiles).toEqual([]);
  });

  it("honors an explicit frameworkVersion and docs references", async () => {
    const result = await newTemplate({
      templatesDir,
      stack: "phaser",
      version: "4",
      language: "javascript",
      frameworkVersion: "4.2.1",
      references: ["https://docs.phaser.io/", "docs/notes.md"],
    });

    const manifest = parseManifest(
      await readFile(join(result.templateDir, "manifest.json"), "utf8"),
    );
    expect(manifest.frameworkVersion).toBe("4.2.1");
    expect(manifest.references).toEqual([
      "https://docs.phaser.io/",
      "docs/notes.md",
    ]);
    expect(result.manifest.references).toEqual(manifest.references);
  });

  it("refuses to clobber an existing template", async () => {
    await newTemplate({ templatesDir, stack: "bevy", version: "0.19", language: "rust" });

    await expect(
      newTemplate({ templatesDir, stack: "bevy", version: "0.19", language: "rust" }),
    ).rejects.toThrow(AuthorError);
    await expect(
      newTemplate({ templatesDir, stack: "bevy", version: "0.19", language: "rust" }),
    ).rejects.toThrow(/already exists/);
  });

  it("rejects empty required fields", async () => {
    await expect(
      newTemplate({ templatesDir, stack: "", version: "1", language: "rust" }),
    ).rejects.toThrow(AuthorError);
    await expect(
      newTemplate({ templatesDir, stack: "s", version: "  ", language: "rust" }),
    ).rejects.toThrow(AuthorError);
  });

  it("rejects a missing --source loudly", async () => {
    await expect(
      newTemplate({
        templatesDir,
        stack: "bevy",
        version: "0.19",
        language: "rust",
        source: join(templatesDir, "does-not-exist"),
      }),
    ).rejects.toThrow(AuthorError);
    await expect(
      newTemplate({
        templatesDir,
        stack: "bevy",
        version: "0.19",
        language: "rust",
        source: join(templatesDir, "does-not-exist"),
      }),
    ).rejects.toThrow(/--source not found/);
  });
});

describe("harvestSource", () => {
  it("copies the project tree verbatim, preserving modes", async () => {
    const source = await makeTempDir();
    const dest = await makeTempDir();
    await mkdir(join(source, "src"), { recursive: true });
    await mkdir(join(source, "scripts"), { recursive: true });
    await writeFile(join(source, "README.md"), "readme\n");
    await writeFile(join(source, "src", "main.rs"), "fn main() {}\n");
    const runScript = join(source, "scripts", "run.sh");
    await writeFile(runScript, "#!/bin/sh\necho hi\n");
    // Mark the script executable so the harvest must preserve the bit.
    await chmod(runScript, 0o755);

    const harvested = await harvestSource(source, dest);

    expect(harvested).toEqual(["README.md", "scripts/run.sh", "src/main.rs"]);
    expect(await readFile(join(dest, "README.md"), "utf8")).toBe("readme\n");
    expect(await readFile(join(dest, "src", "main.rs"), "utf8")).toBe(
      "fn main() {}\n",
    );
    const mode = (await stat(join(dest, "scripts", "run.sh"))).mode & 0o777;
    expect(mode).toBe(0o755);
  });

  it("excludes build/state directories", async () => {
    const source = await makeTempDir();
    const dest = await makeTempDir();
    for (const dir of [".git", "node_modules", "target", "dist", "build"]) {
      await mkdir(join(source, dir), { recursive: true });
      await writeFile(join(source, dir, "artifact.bin"), "x\n");
    }
    await writeFile(join(source, "keep.txt"), "y\n");

    const harvested = await harvestSource(source, dest);

    expect(harvested).toEqual(["keep.txt"]);
    expect(await readdir(dest)).toEqual(["keep.txt"]);
  });
});
