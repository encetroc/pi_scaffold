import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  GitError,
  INITIAL_COMMIT_MESSAGE,
  addRemote,
  commitInitial,
  gitInit,
  initAndCommit,
} from "./git.js";

const execFileAsync = promisify(execFile);

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "scafstak-git-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

/** Local identity, per the ticket: "tests run with a local git identity". */
const IDENTITY_ENV = {
  GIT_AUTHOR_NAME: "Scafstak Test",
  GIT_AUTHOR_EMAIL: "test@scafstak.local",
  GIT_COMMITTER_NAME: "Scafstak Test",
  GIT_COMMITTER_EMAIL: "test@scafstak.local",
};

/** Keep commits hermetic: ignore any user/system config on this machine. */
const ISOLATION_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of [
    ...Object.keys(IDENTITY_ENV),
    ...Object.keys(ISOLATION_ENV),
  ]) {
    saved[key] = process.env[key];
  }
  Object.assign(process.env, IDENTITY_ENV, ISOLATION_ENV);
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("gitInit", () => {
  it("creates a .git directory in the target dir", async () => {
    const dir = await makeTempDir();
    await gitInit(dir);

    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--is-inside-work-tree"],
      { cwd: dir },
    );
    expect(stdout.trim()).toBe("true");
  });
});

describe("initAndCommit", () => {
  it("creates valid git history with the mandated first-commit message", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "hello.txt"), "hi\n");
    await initAndCommit(dir);

    // Exactly one commit, with the FOUNDATION contract message.
    const log = await execFileAsync("git", ["log", "--format=%s"], {
      cwd: dir,
    });
    expect(log.stdout.trim()).toBe(INITIAL_COMMIT_MESSAGE);

    // Working tree clean; the file is tracked.
    const status = await execFileAsync("git", ["status", "--porcelain"], {
      cwd: dir,
    });
    expect(status.stdout.trim()).toBe("");
    const tracked = await execFileAsync("git", ["ls-files"], { cwd: dir });
    expect(tracked.stdout.trim().split("\n")).toContain("hello.txt");
  });

  it("commits the whole scaffolded tree in one commit", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "a.txt"), "a\n");
    await mkdir(join(dir, "docs"), { recursive: true });
    await writeFile(join(dir, "docs", "b.txt"), "b\n");
    await writeFile(join(dir, ".gitignore"), "node_modules/\n");
    await initAndCommit(dir);

    const tracked = await execFileAsync("git", ["ls-files"], { cwd: dir });
    expect(tracked.stdout.trim().split("\n").sort()).toEqual([
      ".gitignore",
      "a.txt",
      "docs/b.txt",
    ]);
  });
});

describe("addRemote", () => {
  it("adds the URL as origin", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "x.txt"), "x\n");
    await initAndCommit(dir);

    await addRemote(dir, "git@github.com:encetroc/some-game.git");

    const { stdout } = await execFileAsync(
      "git",
      ["remote", "get-url", "origin"],
      { cwd: dir },
    );
    expect(stdout.trim()).toBe("git@github.com:encetroc/some-game.git");
  });
});

describe("without a configured identity", () => {
  beforeEach(() => {
    for (const key of Object.keys(IDENTITY_ENV)) {
      delete process.env[key];
    }
  });

  it("commitInitial fails loudly with GitError", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "x.txt"), "x\n");
    await gitInit(dir);

    await expect(commitInitial(dir)).rejects.toThrow(GitError);
    await expect(commitInitial(dir)).rejects.toThrow(/git commit -m/);
  });
});
