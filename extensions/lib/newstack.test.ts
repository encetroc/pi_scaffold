import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthorError } from "../../src/engine/index.js";

import { buildKickoff, runNewStack } from "./newstack.js";
import { WizardCancelled, type WizardUi } from "./wizard.js";

let tempRoot: string;
const tempDirs: string[] = [];

beforeEach(() => {
  tempRoot = `${tmpdir()}/scafstak-newstack-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  tempDirs.push(tempRoot);
});

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

class ScriptedUi implements WizardUi {
  index = 0;
  constructor(private readonly script: Array<string | undefined>) {}
  async select(): Promise<string | undefined> {
    return this.script[this.index++] ?? undefined;
  }
  async input(): Promise<string | undefined> {
    return this.script[this.index++] ?? undefined;
  }
  async confirm(): Promise<boolean> {
    return (this.script[this.index++] ?? "0") === "yes";
  }
}

describe("buildKickoff", () => {
  it("names the template, refs, verify pair, and the no-commit rule", () => {
    const kickoff = buildKickoff({
      templateDir: join(tempRoot, "templates", "bevy", "0.20"),
      manifest: {
        name: "bevy-0.20",
        stack: "bevy",
        frameworkVersion: "0.20",
        language: "rust",
        references: ["https://bevy.org/learn", "docs/local.md"],
      },
    });
    expect(kickoff).toContain("templates/bevy/0.20");
    expect(kickoff).toContain("bevy 0.20");
    expect(kickoff).toContain("https://bevy.org/learn");
    expect(kickoff).toContain("docs/local.md");
    expect(kickoff).toContain('`scafstak_verify_template` with "bevy/0.20"');
    expect(kickoff).toContain("Do NOT commit");
    expect(kickoff).toContain("no template lands unverified");
  });

  it("tells the agent to find docs when no references are declared", () => {
    const kickoff = buildKickoff({
      templateDir: join(tempRoot, "templates", "phaser", "5"),
      manifest: {
        name: "phaser-5",
        stack: "phaser",
        frameworkVersion: "5",
        language: "javascript",
        references: [],
      },
    });
    expect(kickoff).toContain("none declared");
    expect(kickoff).toContain('with "phaser/5"');
  });
});

describe("runNewStack", () => {
  it("creates the skeleton from args + references and builds the kickoff", async () => {
    const templatesDir = join(tempRoot, "templates");
    await mkdir(templatesDir, { recursive: true });
    const ui = new ScriptedUi([
      "https://bevy.org/learn, docs/local.md", // references
    ]);

    const result = await runNewStack(ui, {
      templatesDir,
      args: ["bevy", "0.20", "rust"],
    });

    expect(result.templateDir).toBe(join(templatesDir, "bevy", "0.20"));
    expect(result.manifest).toMatchObject({
      name: "bevy-0.20",
      stack: "bevy",
      frameworkVersion: "0.20",
      language: "rust",
      references: ["https://bevy.org/learn", "docs/local.md"],
    });

    // Skeleton shape: manifest.json + getting-started.md + files/.
    const files = (await readdir(result.templateDir)).sort();
    expect(files).toEqual(["files", "getting-started.md", "manifest.json"]);
    expect(await stat(join(result.templateDir, "files"))).toBeTruthy();
    const gettingStarted = await readFile(
      join(result.templateDir, "getting-started.md"),
      "utf8",
    );
    expect(gettingStarted).toContain("bevy 0.20 — getting started");

    expect(result.kickoff).toContain('with "bevy/0.20"');
  });

  it("prompts for missing fields and honors an empty references answer", async () => {
    const templatesDir = join(tempRoot, "templates");
    await mkdir(templatesDir, { recursive: true });
    const ui = new ScriptedUi([
      "bevy", // stack
      "0.20", // version
      "rust", // language
      "", // references -> none
    ]);

    const result = await runNewStack(ui, { templatesDir, args: [] });

    expect(result.manifest).toMatchObject({
      stack: "bevy",
      frameworkVersion: "0.20",
      language: "rust",
      references: [],
    });
  });

  it("throws WizardCancelled when the user backs out", async () => {
    const templatesDir = join(tempRoot, "templates");
    await mkdir(templatesDir, { recursive: true });
    const ui = new ScriptedUi([undefined]); // cancel at the first prompt

    await expect(runNewStack(ui, { templatesDir, args: [] })).rejects.toThrow(
      WizardCancelled,
    );
  });

  it("never clobbers an existing template", async () => {
    const templatesDir = join(tempRoot, "templates");
    const existing = join(templatesDir, "bevy", "0.20");
    await mkdir(existing, { recursive: true });
    const ui = new ScriptedUi(["https://bevy.org"]);

    await expect(
      runNewStack(ui, { templatesDir, args: ["bevy", "0.20", "rust"] }),
    ).rejects.toThrow(AuthorError);
  });
});