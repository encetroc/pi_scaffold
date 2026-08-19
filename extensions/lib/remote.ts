/**
 * Remote handling for the scafstak wizard (extension layer, not the engine).
 *
 * Ticket #9: after the first commit the wizard asks what happens with the
 * remote — none, add an existing URL, or create a GitHub repo via `gh` and
 * push. The engine adds the remote (`addRemote`) but never pushes; pushing
 * and repo creation stay here per ADR 0004 / issue #4.
 *
 * All subprocess failures surface as `RemoteError` with a message that keeps
 * the already-committed local project intact — the scaffold is never rolled
 * back because a remote step failed.
 */

import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { addRemote } from "../../src/engine/index.js";

const execFileAsync = promisify(execFile);

export class RemoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteError";
  }
}

async function runGit(dir: string, args: string[]): Promise<void> {
  try {
    await execFileAsync("git", args, { cwd: dir });
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr?.trim();
    const detail = stderr ? `: ${stderr}` : "";
    throw new RemoteError(`git ${args.join(" ")} failed in ${dir}${detail}`);
  }
}

/**
 * Push the current branch to `origin` with `-u` so the upstream is recorded.
 * The branch name resolves at runtime (init may default to `main` or `master`).
 */
export async function pushOrigin(dir: string): Promise<void> {
  const { stdout } = await execFileAsync(
    "git",
    ["rev-parse", "--abbrev-ref", "HEAD"],
    { cwd: dir },
  );
  const branch = stdout.trim();
  if (branch.length === 0) {
    throw new RemoteError(`cannot resolve current branch in ${dir}`);
  }
  await runGit(dir, ["push", "-u", "origin", branch]);
}

/** Add an existing URL as origin, then push the first commit to it. */
export async function addAndPush(dir: string, url: string): Promise<void> {
  await addRemote(dir, url); // engine seam
  await pushOrigin(dir);
}

/**
 * Create a new GitHub repo from the local repo via `gh` and push the first
 * commit. `repoName` is the bare repo name (`owner` optional); gh resolves the
 * same and owner from the `gh` session. A visibility flag is required so `gh`
 * runs non-interactively (no prompt, no hang).
 */
export async function createGitHubRepo(
  dir: string,
  repoName: string,
  visibility: "public" | "private",
): Promise<void> {
  const source = resolve(dir);
  try {
    await execFileAsync(
      "gh",
      ["repo", "create", repoName, "--source", source, "--push", `--${visibility}`],
    );
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr?.trim() ?? "";
    const detail =
      stderr.length > 0 ? `: ${stderr}` : ` (${(err as Error).message})`;
    throw new RemoteError(
      `gh repo create ${repoName} failed — local project intact${detail}`,
    );
  }
}