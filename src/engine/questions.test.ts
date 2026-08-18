import { describe, expect, it } from "vitest";

import {
  QuestionError,
  resolvedAnswers,
  resolveQuestions,
} from "./questions.js";
import type { Manifest } from "./manifest.js";

const manifest: Manifest = {
  name: "x",
  stack: "s",
  frameworkVersion: "1",
  language: "rust",
  questions: [
    { id: "window_title", label: "Window title", default: "{{project_name}}" },
    {
      id: "crate_name",
      label: "Crate name",
      default: "{{project_name_snake}}",
    },
    { id: "plain", label: "Plain", default: "default-plain" },
  ],
  variables: { project_name_snake: "{{project_name}} -> snake_case" },
};

describe("resolveQuestions", () => {
  it("resolves defaults through answers and derived variables", () => {
    const qs = resolveQuestions(manifest, { project_name: "My Game" });
    const byId = Object.fromEntries(qs.map((q) => [q.id, q]));

    expect(byId.window_title).toEqual({
      id: "window_title",
      label: "Window title",
      value: "My Game",
      fromDefault: true,
    });
    expect(byId.crate_name).toEqual({
      id: "crate_name",
      label: "Crate name",
      value: "my_game",
      fromDefault: true,
    });
    expect(byId.plain!.value).toBe("default-plain");
    expect(byId.plain!.fromDefault).toBe(true);
  });

  it("prefers a provided answer over the default", () => {
    const qs = resolveQuestions(manifest, {
      project_name: "My Game",
      window_title: "Custom Title",
    });
    const windowTitle = qs.find((q) => q.id === "window_title")!;
    expect(windowTitle.value).toBe("Custom Title");
    expect(windowTitle.fromDefault).toBe(false);
  });

  it("errors when a question has no answer and no default", () => {
    const noDefault: Manifest = {
      name: "x",
      stack: "s",
      frameworkVersion: "1",
      language: "rust",
      questions: [{ id: "req", label: "Required" }],
    };
    expect(() => resolveQuestions(noDefault, {})).toThrow(QuestionError);
    expect(() => resolveQuestions(noDefault, {})).toThrow(
      /question "req" has no answer and no default/,
    );
  });

  it("errors loudly when a default references an unknown variable", () => {
    const bad: Manifest = {
      ...manifest,
      questions: [{ id: "q", label: "Q", default: "{{nope}}" }],
    };
    expect(() => resolveQuestions(bad, { project_name: "X" })).toThrow(
      /unknown variable "\{\{nope\}\}" in default for question "q"/,
    );
  });
});

describe("resolvedAnswers", () => {
  it("merges provided answers with resolved question values", () => {
    const answers = resolvedAnswers(manifest, { project_name: "My Game" });
    expect(answers).toEqual({
      project_name: "My Game",
      window_title: "My Game",
      crate_name: "my_game",
      plain: "default-plain",
    });
  });
});
