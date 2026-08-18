/**
 * Git operations for the scaffold engine (pure — no pi APIs, per ADR 0004).
 *
 * Every scaffold ends with `git init` + a first commit. The engine supports
 * adding a remote; pushing stays in the extension layer (never the engine).
 *
 * Git commands run as subprocesses inheriting `process.env`, so a caller can
 * inject a local identity via the standard `GIT_AUTHOR_*` / `GIT_COMMITTER_*`
 * variables (the test suite does this) or rely on the user's global config.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitError";
  }
}

/** Commit message mandated by the FOUNDATION contract. */
export const INITIAL_COMMIT_MESSAGE = "scaffold: initial project";

async function runGit(dir: string, args: string[]): Promise<void> {
  try {
    await execFileAsync("git", args, { cwd: dir });
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr?.trim();
    const detail = stderr ? `: ${stderr}` : "";
    throw new GitError(`git ${args.join(" ")} failed in ${dir}${detail}`);
  }
}

/** `git init` in `dir` (creates `.git`; safe if the dir already exists). */
export async function gitInit(dir: string): Promise<void> {
  await runGit(dir, ["init"]);
}

/**
 * Stage everything and create the first commit with `INITIAL_COMMIT_MESSAGE`.
 * The commit fails loudly (GitError) if no identity is configured — the
 * extension surfaces the stderr, which suggests how to set one.
 */
export async function commitInitial(dir: string): Promise<void> {
  await runGit(dir, ["add", "-A"]);
  await runGit(dir, ["commit", "-m", INITIAL_COMMIT_MESSAGE]);
}

/**
 * Add `url` as the `origin` remote. Adding a remote is an engine concern;
 * pushing, and creating repos via `gh`, stay in the extension layer.
 */
export async function addRemote(dir: string, url: string): Promise<void> {
  await runGit(dir, ["remote", "add", "origin", url]);
}

/**
 * `git init` + stage + first commit in one step — the standard end of a
 * scaffold. Same semantics as calling `gitInit` then `commitInitial`.
 */
export async function initAndCommit(dir: string): Promise<void> {
  await gitInit(dir);
  await commitInitial(dir);
}
