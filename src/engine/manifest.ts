/**
 * Manifest parsing and validation (pure — no pi APIs, per ADR 0004).
 *
 * A template manifest declares the stack, framework version, wizard
 * questions, derived variables, and commands for one template directory.
 */

export interface Question {
  id: string;
  label: string;
  default?: string;
}

export interface ManifestCommands {
  run?: string;
  test?: string;
  verifyCheck?: string[];
  verifyBuild?: string[];
}

export interface Manifest {
  name: string;
  stack: string;
  frameworkVersion: string;
  language: string;
  buildTargets?: string[];
  questions?: Question[];
  variables?: Record<string, string>;
  commands?: ManifestCommands;
  gettingStarted?: string;
  references?: string[];
}

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}

const REQUIRED_STRING_FIELDS = [
  "name",
  "stack",
  "frameworkVersion",
  "language",
] as const;

const KNOWN_FIELDS = new Set([
  "name",
  "stack",
  "frameworkVersion",
  "language",
  "buildTargets",
  "questions",
  "variables",
  "commands",
  "gettingStarted",
  "references",
]);

const KNOWN_COMMAND_FIELDS = new Set([
  "run",
  "test",
  "verifyCheck",
  "verifyBuild",
]);

function fail(message: string): never {
  throw new ManifestError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate and normalize a parsed manifest. Throws ManifestError with a
 * clear, field-specific message on the first problem found.
 */
export function validateManifest(raw: unknown): Manifest {
  if (!isRecord(raw)) {
    fail("manifest.json must be a JSON object");
  }

  for (const key of Object.keys(raw)) {
    if (!KNOWN_FIELDS.has(key)) {
      fail(`unknown field "${key}" in manifest.json`);
    }
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    const value = raw[field];
    if (typeof value !== "string" || value.trim() === "") {
      fail(`"${field}" is required and must be a non-empty string`);
    }
  }

  if (raw.buildTargets !== undefined) {
    if (
      !Array.isArray(raw.buildTargets) ||
      raw.buildTargets.some((t) => typeof t !== "string")
    ) {
      fail(`"buildTargets" must be an array of strings`);
    }
  }

  const questions = raw.questions;
  if (questions !== undefined) {
    if (!Array.isArray(questions)) {
      fail(`"questions" must be an array`);
    }
    const seen = new Set<string>();
    for (const q of questions) {
      if (!isRecord(q)) {
        fail(`each question must be an object`);
      }
      if (typeof q.id !== "string" || q.id.trim() === "") {
        fail(`each question requires a non-empty "id"`);
      }
      if (typeof q.label !== "string" || q.label.trim() === "") {
        fail(`question "${q.id}" requires a non-empty "label"`);
      }
      if (q.default !== undefined && typeof q.default !== "string") {
        fail(`question "${q.id}" "default" must be a string`);
      }
      if (seen.has(q.id)) {
        fail(`duplicate question id "${q.id}"`);
      }
      seen.add(q.id);
    }
  }

  const variables = raw.variables;
  if (variables !== undefined) {
    if (!isRecord(variables)) {
      fail(`"variables" must be an object`);
    }
    for (const [name, spec] of Object.entries(variables)) {
      if (typeof spec !== "string") {
        fail(`variable "${name}" must be a string`);
      }
    }
  }

  const commands = raw.commands;
  if (commands !== undefined) {
    if (!isRecord(commands)) {
      fail(`"commands" must be an object`);
    }
    for (const key of Object.keys(commands)) {
      if (!KNOWN_COMMAND_FIELDS.has(key)) {
        fail(`unknown command field "${key}"`);
      }
    }
    for (const key of ["run", "test"] as const) {
      if (commands[key] !== undefined && typeof commands[key] !== "string") {
        fail(`command "${key}" must be a string`);
      }
    }
    for (const key of ["verifyCheck", "verifyBuild"] as const) {
      if (
        commands[key] !== undefined &&
        (!Array.isArray(commands[key]) ||
          commands[key].some((c) => typeof c !== "string"))
      ) {
        fail(`command "${key}" must be an array of strings`);
      }
    }
  }

  if (
    raw.gettingStarted !== undefined &&
    typeof raw.gettingStarted !== "string"
  ) {
    fail(`"gettingStarted" must be a string`);
  }

  if (raw.references !== undefined) {
    if (
      !Array.isArray(raw.references) ||
      raw.references.some((r) => typeof r !== "string")
    ) {
      fail(`"references" must be an array of strings`);
    }
  }

  return raw as unknown as Manifest;
}

/**
 * Parse a manifest JSON string and validate it.
 */
export function parseManifest(json: string): Manifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    fail(`manifest.json is not valid JSON: ${(err as Error).message}`);
  }
  return validateManifest(parsed);
}
