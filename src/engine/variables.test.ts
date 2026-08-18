import { describe, expect, it } from "vitest";

import {
  VariableError,
  isTransformName,
  resolveVariables,
  substituteTemplate,
} from "./variables.js";
import type { Manifest } from "./manifest.js";

const manifest = (variables: Manifest["variables"]): Manifest => ({
  name: "x",
  stack: "s",
  frameworkVersion: "1",
  language: "rust",
  variables,
});

describe("substituteTemplate", () => {
  it("replaces every {{var}} occurrence", () => {
    expect(substituteTemplate("a {{x}} b {{x}} c", { x: "X" })).toBe(
      "a X b X c",
    );
  });

  it("tolerates spaces inside braces", () => {
    expect(substituteTemplate("{{ x }}", { x: "X" })).toBe("X");
  });

  it("errors loudly on unknown variables, listing known ones", () => {
    expect(() => substituteTemplate("{{missing}}", { known: "k" })).toThrow(
      /unknown variable "\{\{missing\}\}" .*known: known/,
    );
  });
});

describe("resolveVariables", () => {
  it("passes answers through unchanged", () => {
    const vars = resolveVariables(manifest(undefined), {
      project_name: "My Game",
    });
    expect(vars).toEqual({ project_name: "My Game" });
  });

  it("applies a transform to a referenced answer", () => {
    const vars = resolveVariables(
      manifest({ project_name_snake: "{{project_name}} -> snake_case" }),
      { project_name: "My Game" },
    );
    expect(vars.project_name_snake).toBe("my_game");
  });

  it("substitutes plain specs referencing answers", () => {
    const vars = resolveVariables(
      manifest({ greeting: "Hello {{project_name}}" }),
      { project_name: "World" },
    );
    expect(vars.greeting).toBe("Hello World");
  });

  it("lets a variable reference an earlier variable", () => {
    const vars = resolveVariables(
      manifest({
        snake: "{{project_name}} -> snake_case",
        crate_path: "crates/{{snake}}",
      }),
      { project_name: "My Game" },
    );
    expect(vars.crate_path).toBe("crates/my_game");
  });

  it("errors on forward references with a clear message", () => {
    expect(() =>
      resolveVariables(
        manifest({
          crate_path: "crates/{{snake}}",
          snake: "{{project_name}} -> snake_case",
        }),
        { project_name: "My Game" },
      ),
    ).toThrow(/unknown variable "\{\{snake\}\}" in variable "crate_path"/);
  });

  it("errors on unknown transforms, listing known ones", () => {
    expect(() =>
      resolveVariables(manifest({ snake: "{{project_name}} -> leetspeak" }), {
        project_name: "My Game",
      }),
    ).toThrow(/unknown transform "leetspeak" \(known: snake_case/);
  });
});

describe("isTransformName", () => {
  it("recognizes known transforms", () => {
    expect(isTransformName("snake_case")).toBe(true);
    expect(isTransformName("PascalCase")).toBe(true);
    expect(isTransformName("nope")).toBe(false);
  });
});

describe("transforms", () => {
  const cases: Array<[string, string, string]> = [
    ["snake_case", "My Game", "my_game"],
    ["snake_case", "MyGame", "my_game"],
    ["kebab-case", "My Game", "my-game"],
    ["camelCase", "My Game", "myGame"],
    ["PascalCase", "my game", "MyGame"],
    ["lower", "MyGame", "mygame"],
    ["upper", "MyGame", "MYGAME"],
  ];

  for (const [transform, input, expected] of cases) {
    it(`${transform}("${input}") -> "${expected}"`, () => {
      const vars = resolveVariables(
        manifest({ out: `{{input}} -> ${transform}` }),
        { input },
      );
      expect(vars.out).toBe(expected);
    });
  }
});

describe("VariableError type", () => {
  it("is thrown as VariableError", () => {
    expect(() => resolveVariables(manifest({ x: "{{nope}}" }), {})).toThrow(
      VariableError,
    );
  });
});
