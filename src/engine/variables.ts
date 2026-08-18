/**
 * Variable resolution (pure — no pi APIs).
 *
 * Answers (from the wizard) plus manifest-declared derived variables combine
 * into a single substitution table. Derived variables use the form
 * `{{ref}} -> transform` (e.g. `{{project_name}} -> snake_case`).
 */

import type { Manifest } from "./manifest.js";

export type Answers = Record<string, string>;

/** Known case transforms, applied to a resolved value. */
export type TransformName =
  | "snake_case"
  | "kebab-case"
  | "camelCase"
  | "PascalCase"
  | "lower"
  | "upper";

const TRANSFORMS: Record<TransformName, (value: string) => string> = {
  snake_case: (value) =>
    value
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[\s-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase(),
  "kebab-case": (value) =>
    value
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase(),
  camelCase: (value) => {
    const words = value
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .split(/[\s\-_]+/)
      .filter(Boolean);
    const [first, ...rest] = words;
    const head = (first ?? "").toLowerCase();
    const tail = rest.map(
      (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    );
    return head + tail.join("");
  },
  PascalCase: (value) => {
    const words = value
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .split(/[\s\-_]+/)
      .filter(Boolean);
    return words
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join("");
  },
  lower: (value) => value.toLowerCase(),
  upper: (value) => value.toUpperCase(),
};

export class VariableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VariableError";
  }
}

const TRANSFORM_SPEC = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*->\s*([a-zA-Z_-]+)\s*$/;

export function isTransformName(name: string): name is TransformName {
  return name in TRANSFORMS;
}

/**
 * Resolve answers + manifest variables into a flat substitution table.
 * Variables are resolved in declaration order, so a variable may reference
 * an earlier variable or any answer; forward references error loudly.
 */
export function resolveVariables(
  manifest: Manifest,
  answers: Answers,
): Record<string, string> {
  const vars: Record<string, string> = { ...answers };

  for (const [name, spec] of Object.entries(manifest.variables ?? {})) {
    const transformMatch = spec.match(TRANSFORM_SPEC);
    if (transformMatch) {
      const ref = transformMatch[1]!.trim();
      const transform = transformMatch[2]!.trim();
      if (!isTransformName(transform)) {
        throw new VariableError(
          `variable "${name}" uses unknown transform "${transform}" (known: ${Object.keys(
            TRANSFORMS,
          ).join(", ")})`,
        );
      }
      const source = vars[ref];
      if (source === undefined) {
        throw new VariableError(
          `variable "${name}" references "${ref}", which is not defined ` +
            `(declare it earlier, or provide it as an answer)`,
        );
      }
      vars[name] = TRANSFORMS[transform](source);
      continue;
    }

    vars[name] = substituteTemplate(spec, vars, `variable "${name}"`);
  }

  return vars;
}

/**
 * Replace all `{{name}}` occurrences in `template`. Throws VariableError with
 * `context` in the message when a referenced name is undefined.
 */
export function substituteTemplate(
  template: string,
  vars: Record<string, string>,
  context = "template",
): string {
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, name: string) => {
    const key = name.trim();
    const value = vars[key];
    if (value === undefined) {
      const known = Object.keys(vars).join(", ");
      throw new VariableError(
        `unknown variable "{{${key}}}" in ${context}` +
          (known ? ` (known: ${known})` : " (no variables defined)"),
      );
    }
    return value;
  });
}
