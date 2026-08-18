/**
 * Scafstak — pi extension entry point.
 *
 * Registers the `/scafstak` command surface. The full interactive wizard is
 * #7; this entry proves the package loads and the command registers, and
 * wires the pure scaffold engine (src/engine) into the extension.
 *
 * Template-authoring tools (scafstak_list / scafstak_new_template /
 * scafstak_verify_template) land in #10.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  loadManifest,
  resolveVariables,
  scaffold,
} from "../src/engine/index.js";

export default function scafstak(pi: ExtensionAPI) {
  pi.registerCommand("scafstak", {
    description:
      "Scaffold an AI-ready game project from a manifest-driven template",
    getArgumentCompletions: (prefix) => {
      // Stack/version completion arrives in #8. Keep the surface silent for now.
      void prefix;
      return null;
    },
    handler: async (args, ctx) => {
      void args;
      ctx.ui.notify(
        "scafstak: engine loaded — interactive wizard lands in #7",
        "info",
      );
    },
  });

  // Reference the engine so the entry point is verifiably wired even before
  // the wizard exists. This keeps the import tree exercised by /reload.
  void loadManifest;
  void resolveVariables;
  void scaffold;
}
