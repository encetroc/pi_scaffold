/**
 * Scafstak — pi extension entry point.
 *
 * Registers the `/scafstak` command and the authoring tools (ticket #10:
 * scafstak_list / scafstak_new_template / scafstak_verify_template). The
 * command drives the interactive happy path (ticket #7): stack → version →
 * questionnaire (defaults pre-filled) → summary confirm → scaffold → first
 * commit → verify → next-steps printout. Deterministic, no LLM in the loop.
 * Non-TUI invocation fails with a clean error instead of hanging. Args
 * preselect + tab completion ship here (ticket #8).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  WizardCancelled,
  completeArgs,
  nextSteps,
  runWizard,
  type WizardUi,
} from "./lib/wizard.js";

import { templateRoot } from "./lib/root.js";
import { registerAuthoringTools } from "./tools.js";

export default function scafstak(pi: ExtensionAPI) {
  registerAuthoringTools(pi);

  pi.registerCommand("scafstak", {
    description:
      "Scaffold an AI-ready game project from a manifest-driven template",
    getArgumentCompletions: (argumentText) =>
      completeArgs(templateRoot(import.meta.url), argumentText),
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify(
          "scafstak needs an interactive (TUI) session — non-interactive modes are not supported (#7).",
          "error",
        );
        return;
      }

      const ui: WizardUi = {
        select: (prompt, options) => ctx.ui.select(prompt, options),
        input: (prompt, initial) => ctx.ui.input(prompt, initial),
        confirm: (title, body) => ctx.ui.confirm(title, body),
      };

      const argv = args.trim().split(/\s+/).filter((s) => s.length > 0);

      const templatesDir = templateRoot(import.meta.url);

      try {
        const result = await runWizard(ui, {
          templatesDir,
          cwd: ctx.cwd,
          args: argv,
        });

        const report = result.verification;
        let verifyLine: string;
        if (!report.ok) {
          verifyLine = `Verify (${report.depth}): FAILED — see output above for details`;
        } else if (report.checks.length === 0) {
          verifyLine = `Verify (${report.depth}): nothing to run (skipped or no command defined)`;
        } else {
          verifyLine = `Verify (${report.depth}): passed ✔`;
        }

        ctx.ui.notify(nextSteps(result), "info");
        ctx.ui.notify(`Initial commit created in ${result.destDir}: scaffold: initial project`, "info");
        if (result.remote.choice === "url") {
          ctx.ui.notify(`Pushed to remote: ${result.remote.url}`, "info");
        } else if (result.remote.choice === "gh") {
          ctx.ui.notify(`Created and pushed GitHub repo: ${result.remote.repoName}`, "info");
        }
        ctx.ui.notify(verifyLine, report.ok ? "info" : "warning");
      } catch (err) {
        if (err instanceof WizardCancelled) {
          ctx.ui.notify("scafstak cancelled — nothing was written.", "info");
          return;
        }
        ctx.ui.notify(`scafstak failed: ${(err as Error).message}`, "error");
      }
    },
  });
} // end of scafstak factory