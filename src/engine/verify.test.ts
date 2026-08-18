import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { verify } from "./verify.js";
import type { Manifest } from "./manifest.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "scafstak-verify-"));
  tempDirs.push(dir);
  return dir;
}

beforeEach(async () => {
  tempDirs.length = 0;
});

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

const manifest = (commands: Manifest["commands"]): Manifest => ({
  name: "x",
  stack: "s",
  frameworkVersion: "1",
  language: "rust",
  commands,
});

const NEVER_INSTALLED = ["definitely-not-a-real-command-scafstak-xyz"];

describe("skip", () => {
  it("reports no verification and runs nothing", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "x.txt"), "x\n");

    const report = await verify(
      manifest({ verifyCheck: NEVER_INSTALLED, verifyBuild: NEVER_INSTALLED }),
      dir,
      "skip",
    );

    expect(report).toEqual({ depth: "skip", ok: true, checks: [] });
  });
});

describe("light (toolchain presence)", () => {
  it("passes when the toolchain command is present", async () => {
    const dir = await makeTempDir();
    const report = await verify(
      manifest({ verifyCheck: ["node", "--version"] }),
      dir,
      "light",
    );

    expect(report.depth).toBe("light");
    expect(report.ok).toBe(true);
    expect(report.checks).toEqual([
      { command: "node --version", ok: true },
    ]);
  });

  it("fails loudly when the toolchain command is missing", async () => {
    const dir = await makeTempDir();
    const report = await verify(manifest({ verifyCheck: NEVER_INSTALLED }), dir, "light");

    expect(report.ok).toBe(false);
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0]!.ok).toBe(false);
    expect(report.checks[0]!.command).toBe(
      NEVER_INSTALLED.join(" "),
    );
    expect(report.checks[0]!.output).toBeTruthy();
  });

  it("reports a pass with no checks when no verifyCheck is declared", async () => {
    const dir = await makeTempDir();
    const report = await verify(manifest({}), dir, "light");

    expect(report).toEqual({ depth: "light", ok: true, checks: [] });
  });
});

describe("full (build)", () => {
  it("passes when the build command succeeds", async () => {
    const dir = await makeTempDir();
    const report = await verify(manifest({ verifyBuild: ["sh", "-c", "true"] }), dir, "full");

    expect(report.ok).toBe(true);
    expect(report.checks).toEqual([{ command: "sh -c true", ok: true }]);
  });

  it("fails when the build command fails, capturing output", async () => {
    const dir = await makeTempDir();
    const report = await verify(
      manifest({ verifyBuild: ["sh", "-c", "echo boom; exit 3"] }),
      dir,
      "full",
    );

    expect(report.ok).toBe(false);
    expect(report.checks[0]!.ok).toBe(false);
    expect(report.checks[0]!.output).toContain("boom");
  });

  it("reports a pass with no checks when no verifyBuild is declared", async () => {
    const dir = await makeTempDir();
    const report = await verify(manifest({}), dir, "full");

    expect(report).toEqual({ depth: "full", ok: true, checks: [] });
  });
});

describe("command execution context", () => {
  it("runs commands with the scaffolded directory as cwd", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "marker.txt"), "x\n");

    const report = await verify(
      manifest({ verifyCheck: ["sh", "-c", "test -f marker.txt"] }),
      dir,
      "light",
    );

    expect(report.ok).toBe(true);
  });
});
