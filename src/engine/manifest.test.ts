import { describe, expect, it } from "vitest";

import { ManifestError, parseManifest, validateManifest } from "./manifest.js";

const valid = {
  name: "bevy-0.19",
  stack: "bevy",
  frameworkVersion: "0.19",
  language: "rust",
  buildTargets: ["native", "web"],
  questions: [{ id: "window_title", label: "Window title", default: "{{project_name}}" }],
  variables: { project_name_snake: "{{project_name}} -> snake_case" },
  commands: {
    run: "./scripts/run.sh",
    test: "./scripts/test.sh",
    verifyCheck: ["cargo", "--version"],
    verifyBuild: ["cargo", "check"],
  },
  gettingStarted: "getting-started.md",
  references: ["https://bevy.org/learn/"],
};

describe("validateManifest", () => {
  it("accepts a valid manifest", () => {
    expect(() => validateManifest(valid)).not.toThrow();
  });

  it("rejects non-object input", () => {
    expect(() => validateManifest("nope")).toThrow(ManifestError);
    expect(() => validateManifest(null)).toThrow(ManifestError);
    expect(() => validateManifest([])).toThrow(ManifestError);
  });

  it("rejects unknown fields", () => {
    expect(() => validateManifest({ ...valid, extra: true })).toThrow(
      /unknown field "extra"/,
    );
  });

  it("rejects missing required fields with a clear message", () => {
    const { name, ...noName } = valid;
    expect(() => validateManifest(noName)).toThrow(
      /"name" is required and must be a non-empty string/,
    );
  });

  it("rejects empty required fields", () => {
    expect(() => validateManifest({ ...valid, stack: "  " })).toThrow(
      /"stack" is required and must be a non-empty string/,
    );
  });

  it("rejects duplicate question ids", () => {
    expect(() =>
      validateManifest({
        ...valid,
        questions: [
          { id: "x", label: "One" },
          { id: "x", label: "Two" },
        ],
      }),
    ).toThrow(/duplicate question id "x"/);
  });

  it("rejects a question missing its label", () => {
    expect(() =>
      validateManifest({
        ...valid,
        questions: [{ id: "x" }],
      }),
    ).toThrow(/question "x" requires a non-empty "label"/);
  });

  it("rejects malformed variables", () => {
    expect(() => validateManifest({ ...valid, variables: { a: 1 } })).toThrow(
      /variable "a" must be a string/,
    );
  });

  it("rejects unknown command fields", () => {
    expect(() =>
      validateManifest({ ...valid, commands: { bogus: "x" } }),
    ).toThrow(/unknown command field "bogus"/);
  });
});

describe("parseManifest", () => {
  it("parses valid JSON", () => {
    const manifest = parseManifest(JSON.stringify(valid));
    expect(manifest.name).toBe("bevy-0.19");
  });

  it("rejects invalid JSON with a clear message", () => {
    expect(() => parseManifest("{ not json")).toThrow(/not valid JSON/);
  });
});
