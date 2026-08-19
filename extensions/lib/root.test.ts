import { stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { templateRoot } from "./root.js";

describe("templateRoot", () => {
  it("resolves to the package-root templates dir regardless of caller depth", async () => {
    // No SCAFSTAK_TEMPLATES: must anchor on this module's fixed location
    // (<pkg>/extensions/lib/root.ts -> ../../templates), NOT on the caller.
    delete process.env.SCAFSTAK_TEMPLATES;
    const root = templateRoot();
    expect(root.endsWith("/templates")).toBe(true);
    // The shipped templates must actually live there.
    expect(
      (await stat(join(root, "bevy", "0.19", "manifest.json"))).isFile(),
    ).toBe(true);
    expect(
      (await stat(join(root, "phaser", "4", "manifest.json"))).isFile(),
    ).toBe(true);
  });

  it("honors the SCAFSTAK_TEMPLATES override", () => {
    process.env.SCAFSTAK_TEMPLATES = "/custom/templates";
    expect(templateRoot()).toBe("/custom/templates");
  });
});
