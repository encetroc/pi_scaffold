/**
 * Dry-run verification tests (#10): dryRunTemplate loads the manifest,
 * resolves every question from defaults (a hole fails loudly), scaffolds
 * into a temp dir, and runs the manifest's verify commands (check + build).
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { dryRunTemplate } from "./dryrun.js";
import { ManifestError } from "./manifest.js";
import { QuestionError } from "./questions.js";
import { ScaffoldError } from "./scaffold.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "scafstak-dryrun-test-"));
  tempDirs.push(dir);
  return dir;
}

let templateDir: string;

/** A minimal template whose checks are cheap and guaranteed present. */
async function writeFixtureTemplate(
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "files"), { recursive: true });
  await writeFile(
    join(dir, "manifest.json"),
    JSON.stringify({
      name: "fixture-1",
      stack: "fixture",
      frameworkVersion: "1",
      language: "rust",
      questions: [
        { id: "window_title", label: "Window title", default: "{{project_name}}" },
      ],
      commands: {
        verifyCheck: ["node", "--version"],
        verifyBuild: ["node", "--version"],
      },
      ...overrides,
    }),
  );
  await writeFile(join(dir, "getting-started.md"), "# Setup\n\nFixture.\n");
  await writeFile(join(dir, "files", "welcome.txt"), "{{project_name}}\n");
  return dir;
}

beforeEach(async () => {
  templateDir = await writeFixtureTemplate();
});

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

describe("dryRunTemplate", () => {
  it("scaffolds with default answers and runs check + build", async () => {
    const result = await dryRunTemplate(templateDir);

    expect(result.manifest.name).toBe("fixture-1");
    expect(result.tempDir).toBeTruthy();
    expect(result.files).toContain("welcome.txt");
    expect(result.files).toContain("AGENTS.md"); // FOUNDATION artifacts included

    const welcome = await readFile(join(result.tempDir, "welcome.txt"), "utf8");
    expect(welcome).toBe("dryrun-fixture\n");

    expect(result.verification.depth).toBe("dry-run");
    expect(result.verification.ok).toBe(true);
    expect(result.verification.checks.map((c) => c.command)).toEqual([
      "node --version",
      "node --version",
    ]);
  });

  it("fails loudly on a question with no answer and no default", async () => {
    const dir = await writeFixtureTemplate({
      questions: [
        { id: "window_title", label: "Window title", default: "{{project_name}}" },
        { id: "api_key", label: "API key" }, // no default → hole
      ],
    });

    await expect(dryRunTemplate(dir)).rejects.toThrow(QuestionError);
    await expect(dryRunTemplate(dir)).rejects.toThrow(/no answer and no default/);
  });

  it("fails loudly on a broken manifest", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "manifest.json"), "{ not json");

    await expect(dryRunTemplate(dir)).rejects.toThrow(ManifestError);
  });

  it("fails loudly when the template has no files/", async () => {
    const dir = await makeTempDir();
    await writeFile(
      join(dir, "manifest.json"),
      JSON.stringify({
        name: "empty-1",
        stack: "empty",
        frameworkVersion: "1",
        language: "rust",
      }),
    );

    await expect(dryRunTemplate(dir)).rejects.toThrow(ScaffoldError);
    await expect(dryRunTemplate(dir)).rejects.toThrow(/no files\/ directory/);
  });

  it("reports a failing build without throwing", async () => {
    const dir = await writeFixtureTemplate({
      commands: {
        verifyCheck: ["node", "--version"],
        verifyBuild: ["sh", "-c", "echo boom; exit 3"],
      },
    });

    const result = await dryRunTemplate(dir);

    expect(result.verification.ok).toBe(false);
    expect(result.verification.checks).toHaveLength(2);
    expect(result.verification.checks[0]!.ok).toBe(true);
    expect(result.verification.checks[1]!.ok).toBe(false);
    expect(result.verification.checks[1]!.output).toContain("boom");
  });
});
