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
import { BorderedLoader } from "@earendil-works/pi-coding-agent";

import {
  WizardCancelled,
  completeArgs,
  nextSteps,
  runWizard,
  type WizardUi,
} from "./lib/wizard.js";

import { runNewStack } from "./lib/newstack.js";

import { templateRoot } from "./lib/root.js";
import { registerAuthoringTools } from "./lib/tools.js";

export default function scafstak(pi: ExtensionAPI) {
  registerAuthoringTools(pi);

  pi.registerCommand("scafstak", {
    description:
      "Scaffold an AI-ready game project from a manifest-driven template",
    getArgumentCompletions: (argumentText) =>
      completeArgs(templateRoot(), argumentText),
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
        // Spinner for the long blocking phases (scaffold, commit, remote,
        // verify) so the user can tell running vs finished. Non-cancellable
        // keeps the flow deterministic — phases finish or fail loudly.
        runInProgress: <T>(
          label: string,
          task: () => Promise<T>,
        ): Promise<T> => {
          let failure: unknown;
          let value: T | undefined;
          return ctx.ui
            .custom<void>((tui, theme, _kb, done) => {
              const loader = new BorderedLoader(tui, theme, label, {
                cancellable: false,
              });
              task()
                .then((v) => {
                  value = v;
                  done();
                })
                .catch((error: unknown) => {
                  failure = error;
                  done();
                });
              return loader;
            })
            .then(() => {
              if (failure !== undefined) throw failure;
              return value as T;
            });
        },
      };

      const argv = args
        .trim()
        .split(/\s+/)
        .filter((s) => s.length > 0);

      const templatesDir = templateRoot();

      try {
        // Ticket #11: the AI authoring flow. The skeleton is created here;
        // the kickoff message then hands the authoring work to the agent
        // (research → fill → cite → dry-run verify).
        if (argv[0] === "new-stack") {
          const result = await runNewStack(ui, {
            templatesDir,
            args: argv.slice(1),
          });
          ctx.ui.notify(
            `Template skeleton created at ${result.templateDir} — handing the authoring task to the agent.`,
            "info",
          );
          ctx.ui.notify(
            "The agent will research official docs, fill files/, write the cited getting-started, and dry-run verify. You review and commit.",
            "info",
          );
          // Always triggers a turn; `followUp` is safe whether or not the
          // agent is currently streaming (delivered once the turn drains).
          pi.sendUserMessage(result.kickoff, { deliverAs: "followUp" });
          return;
        }

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
        ctx.ui.notify(
          `Initial commit created in ${result.destDir}: scaffold: initial project`,
          "info",
        );
        if (result.remote.choice === "url") {
          ctx.ui.notify(`Pushed to remote: ${result.remote.url}`, "info");
        } else if (result.remote.choice === "gh") {
          ctx.ui.notify(
            `Created and pushed GitHub repo: ${result.remote.repoName}`,
            "info",
          );
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
