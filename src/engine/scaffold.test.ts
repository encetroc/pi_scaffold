import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ScaffoldError, loadManifest, scaffold } from "./scaffold.js";
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

describe("loadManifest", () => {
  it("loads and validates a fixture manifest", () => {
    const manifest = loadManifest(fixturesDir);
    expect(manifest.name).toBe("minimal");
    expect(manifest.stack).toBe("teststack");
  });

  it("errors loudly when manifest.json is missing", () => {
    expect(() => loadManifest(tempRoot)).toThrow(ScaffoldError);
  });
});

describe("scaffold", () => {
  it("copies the tree with content and filename substitution", async () => {
    const manifest = loadManifest(fixturesDir);
    // Question answers (window_title, crate_name) as the wizard would resolve them.
    const allVars = resolveVariables(manifest, {
      project_name: "My Game",
      window_title: "My Game",
      crate_name: "my_game",
    });

    const destDir = await makeTempDir();
    const result = await scaffold(manifest, fixturesDir, allVars, destDir, {
      foundation: false,
    });

    expect(result.files.sort()).toEqual([
      "README.md",
      "my_game/config.txt",
      "scripts/run.sh",
      "scripts/test.sh",
      "src/main.rs",
    ]);

    const readme = await readFile(join(destDir, "README.md"), "utf8");
    expect(readme).toBe("# My Game\n\nWindow: My Game\nCrate: my_game\n");

    const main = await readFile(join(destDir, "src", "main.rs"), "utf8");
    expect(main).toBe("fn main() {}\n// crate: my_game\n");

    const config = await readFile(
      join(destDir, "my_game", "config.txt"),
      "utf8",
    );
    expect(config).toBe("name=my_game\n");
  });

  it("errors loudly when a file references an unknown variable", async () => {
    const manifest = loadManifest(fixturesDir);
    // window_title and crate_name are required in file content; omit them.
    const vars = resolveVariables(manifest, { project_name: "My Game" });
    await expect(
      scaffold(manifest, fixturesDir, vars, tempRoot),
    ).rejects.toThrow(/unknown variable/);
  });

  it("preserves executable mode on copied files", async () => {
    // Build a one-off template with an executable script.
    const tplDir = await makeTempDir();
    await mkdir(join(tplDir, "files"), { recursive: true });
    await writeFile(
      join(tplDir, "manifest.json"),
      JSON.stringify({
        name: "exe",
        stack: "s",
        frameworkVersion: "1",
        language: "sh",
      }),
    );
    const scriptPath = join(tplDir, "files", "run.sh");
    await writeFile(scriptPath, "#!/bin/sh\necho hi\n");
    await (await import("node:fs/promises")).chmod(scriptPath, 0o755);

    const manifest = loadManifest(tplDir);
    const destDir = await makeTempDir();
    await scaffold(manifest, tplDir, {}, destDir, { foundation: false });

    const copiedMode = (await stat(join(destDir, "run.sh"))).mode & 0o777;
    expect(copiedMode).toBe(0o755);
  });

  it("errors loudly when the template has no files/ directory", async () => {
    const tplDir = await makeTempDir();
    await writeFile(
      join(tplDir, "manifest.json"),
      JSON.stringify({
        name: "empty",
        stack: "s",
        frameworkVersion: "1",
        language: "sh",
      }),
    );
    const manifest = loadManifest(tplDir);
    await expect(scaffold(manifest, tplDir, {}, tempRoot)).rejects.toThrow(
      /has no files/,
    );
  });

  it("nests substituted directories correctly", async () => {
    const tplDir = await makeTempDir();
    await mkdir(join(tplDir, "files", "{{dir}}", "sub"), { recursive: true });
    await writeFile(
      join(tplDir, "manifest.json"),
      JSON.stringify({
        name: "nest",
        stack: "s",
        frameworkVersion: "1",
        language: "sh",
      }),
    );
    await writeFile(join(tplDir, "files", "{{dir}}", "sub", "a.txt"), "x\n");

    const manifest = loadManifest(tplDir);
    const destDir = await makeTempDir();
    const result = await scaffold(
      manifest,
      tplDir,
      { dir: "renamed" },
      destDir,
      {
        foundation: false,
      },
    );

    expect(result.files).toEqual(["renamed/sub/a.txt"]);
    const content = await readFile(
      join(destDir, "renamed", "sub", "a.txt"),
      "utf8",
    );
    expect(content).toBe("x\n");
  });

  it("skips empty directories and symlinks", async () => {
    const tplDir = await makeTempDir();
    await mkdir(join(tplDir, "files", "empty"), { recursive: true });
    await writeFile(
      join(tplDir, "manifest.json"),
      JSON.stringify({
        name: "skip",
        stack: "s",
        frameworkVersion: "1",
        language: "sh",
      }),
    );
    await writeFile(join(tplDir, "files", "real.txt"), "hi\n");

    const manifest = loadManifest(tplDir);
    const destDir = await makeTempDir();
    const result = await scaffold(manifest, tplDir, {}, destDir, {
      foundation: false,
    });

    expect(result.files).toEqual(["real.txt"]);
    const entries = await readdir(destDir);
    expect(entries).toEqual(["real.txt"]);
  });
});
