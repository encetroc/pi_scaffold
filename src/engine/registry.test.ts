/**
 * Registry discovery tests (#10): listTemplates walks the templates root,
 * reports stack/version/language/buildTargets from manifests, skips
 * non-template dirs, and surfaces broken manifests as errors.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listTemplates } from "./registry.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "scafstak-registry-"));
  tempDirs.push(dir);
  return dir;
}

async function writeManifest(
  templatesDir: string,
  stack: string,
  version: string,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  const dir = join(templatesDir, stack, version);
  await mkdir(join(dir, "files"), { recursive: true });
  await writeFile(
    join(dir, "manifest.json"),
    JSON.stringify({
      name: `${stack}-${version}`,
      stack,
      frameworkVersion: version,
      language: "rust",
      ...overrides,
    }),
  );
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

describe("listTemplates", () => {
  it("reports stack, version, language, and build targets per template", async () => {
    await writeManifest(templatesDir, "bevy", "0.19", {
      language: "rust",
      buildTargets: ["native", "web"],
    });
    await writeManifest(templatesDir, "phaser", "4", {
      language: "javascript",
      buildTargets: ["web"],
    });

    const { templates, errors } = await listTemplates(templatesDir);

    expect(errors).toEqual([]);
    expect(templates).toEqual([
      {
        stack: "bevy",
        version: "0.19",
        name: "bevy-0.19",
        language: "rust",
        buildTargets: ["native", "web"],
      },
      {
        stack: "phaser",
        version: "4",
        name: "phaser-4",
        language: "javascript",
        buildTargets: ["web"],
      },
    ]);
  });

  it("reports empty buildTargets when the manifest declares none", async () => {
    await writeManifest(templatesDir, "minimal", "1");

    const { templates } = await listTemplates(templatesDir);

    expect(templates[0]!.buildTargets).toEqual([]);
  });

  it("skips directories that are not templates (no manifest.json)", async () => {
    await writeManifest(templatesDir, "bevy", "0.19");
    await mkdir(join(templatesDir, "notes"), { recursive: true });
    await mkdir(join(templatesDir, "bevy", "scratch"), { recursive: true });

    const { templates } = await listTemplates(templatesDir);

    expect(templates.map((t) => `${t.stack}/${t.version}`)).toEqual(["bevy/0.19"]);
  });

  it("reports a broken manifest loudly instead of hiding the template", async () => {
    await writeManifest(templatesDir, "good", "1");
    const badDir = join(templatesDir, "broken", "1");
    await mkdir(badDir, { recursive: true });
    await writeFile(join(badDir, "manifest.json"), "{ not json");

    const { templates, errors } = await listTemplates(templatesDir);

    expect(templates.map((t) => t.stack)).toEqual(["good"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.template).toBe("broken/1");
    expect(errors[0]!.message).toContain("manifest.json is not valid JSON");
  });

  it("sorts entries by stack then version", async () => {
    await writeManifest(templatesDir, "phaser", "4");
    await writeManifest(templatesDir, "bevy", "0.20");
    await writeManifest(templatesDir, "bevy", "0.19");

    const { templates } = await listTemplates(templatesDir);

    expect(templates.map((t) => `${t.stack}/${t.version}`)).toEqual([
      "bevy/0.19",
      "bevy/0.20",
      "phaser/4",
    ]);
  });
});
