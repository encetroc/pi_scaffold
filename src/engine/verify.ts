/**
 * Verification for the scaffold engine (pure — no pi APIs, per ADR 0004).
 *
 * After a scaffold the user picks a verification depth; the engine produces a
 * deterministic report for any depth:
 *
 * - `skip`    — no verification runs; the report records that nothing was checked
 * - `light`   — toolchain presence: runs the `commands.verifyCheck` command
 * - `full`    — build: runs the `commands.verifyBuild` command
 * - `dry-run` — authoring dry-run (`#10`): runs BOTH `verifyCheck` and
 *               `verifyBuild`, one report entry each
 *
 * Commands run as subprocesses in the scaffolded directory. Missing
 * manifest commands for a depth produce an empty, pass report rather than an
 * error.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Manifest } from "./manifest.js";

const execFileAsync = promisify(execFile);

export type VerifyDepth = "skip" | "light" | "full" | "dry-run";

export interface VerifyCheckResult {
  /** The command as a display string (args joined with spaces). */
  command: string;
  ok: boolean;
  /** Truncated combined output, present on failure to aid diagnosis. */
  output?: string;
}

export interface VerificationReport {
  depth: VerifyDepth;
  /** True when nothing failed; a `skip` report is always `ok`. */
  ok: boolean;
  /** One entry per command run; empty for `skip` or when no command is defined. */
  checks: VerifyCheckResult[];
}

const MAX_OUTPUT = 2000;

async function runCheck(
  command: string[],
  cwd: string,
): Promise<VerifyCheckResult> {
  const [cmd, ...args] = command;
  try {
    await execFileAsync(cmd ?? "", args, { cwd });
    return { command: command.join(" "), ok: true };
  } catch (err) {
    const output = ((err as { stdout?: string; stderr?: string }).stderr ??
      (err as { stdout?: string }).stdout ??
      "").slice(0, MAX_OUTPUT);
    return {
      command: command.join(" "),
      ok: false,
      output: output || (err as Error).message,
    };
  }
}

function commandFor(manifest: Manifest, depth: Exclude<VerifyDepth, "skip">) {
  if (depth === "light") return manifest.commands?.verifyCheck;
  return manifest.commands?.verifyBuild;
}

/**
 * Verify a scaffolded directory at `depth`. See the file header for per-depth
 * semantics. Returns a `VerificationReport`; it never throws for a failing
 * command — failures are reported in `checks` / `ok`.
 */
export async function verify(
  manifest: Manifest,
  destDir: string,
  depth: VerifyDepth,
): Promise<VerificationReport> {
  if (depth === "skip") {
    return { depth, ok: true, checks: [] };
  }

  if (depth === "dry-run") {
    // Authoring dry-run: toolchain check first, then the real build. Run
    // sequentially so a missing toolchain surfaces before a long build.
    const commands = [manifest.commands?.verifyCheck, manifest.commands?.verifyBuild]
      .filter((c): c is string[] => c !== undefined && c.length > 0);
    const checks: VerifyCheckResult[] = [];
    for (const command of commands) {
      checks.push(await runCheck(command, destDir));
    }
    return { depth, ok: checks.every((c) => c.ok), checks };
  }

  const command = commandFor(manifest, depth);
  const checks =
    command === undefined || command.length === 0
      ? []
      : [await runCheck(command, destDir)];
  return { depth, ok: checks.every((c) => c.ok), checks };
}
