/**
 * Wizard question resolution (pure — no pi APIs).
 *
 * Turns a manifest's declared questions into resolved values using provided
 * answers, falling back to each question's default. Defaults are templates and
 * may reference provided answers (e.g. `{{project_name}}`) and derived
 * variables (e.g. `{{project_name_snake}}`), so they are substituted through
 * the same variable table used for file content.
 */

import type { Manifest } from "./manifest.js";
import { resolveVariables, substituteTemplate } from "./variables.js";

export interface ResolvedQuestion {
  id: string;
  label: string;
  value: string;
  /** true when the value came from the question's default rather than an answer. */
  fromDefault: boolean;
}

export class QuestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuestionError";
  }
}

/**
 * Resolve manifest questions against provided answers. A question with no
 * provided answer and no default errors loudly.
 */
export function resolveQuestions(
  manifest: Manifest,
  provided: Record<string, string> = {},
): ResolvedQuestion[] {
  // Derived variables are computed first so defaults can reference them
  // (e.g. crate_name default `{{project_name_snake}}`).
  const vars = resolveVariables(manifest, provided);

  return (manifest.questions ?? []).map((question) => {
    const answer = provided[question.id];
    if (answer !== undefined) {
      return {
        id: question.id,
        label: question.label,
        value: answer,
        fromDefault: false,
      };
    }
    if (question.default !== undefined) {
      return {
        id: question.id,
        label: question.label,
        value: substituteTemplate(
          question.default,
          vars,
          `default for question "${question.id}"`,
        ),
        fromDefault: true,
      };
    }
    throw new QuestionError(
      `question "${question.id}" has no answer and no default`,
    );
  });
}

/**
 * Convenience: answers map (id → value) for the resolved questions, merged
 * over any extra provided answers (e.g. the generic `project_name`).
 */
export function resolvedAnswers(
  manifest: Manifest,
  provided: Record<string, string> = {},
): Record<string, string> {
  const answers: Record<string, string> = { ...provided };
  for (const q of resolveQuestions(manifest, provided)) {
    answers[q.id] = q.value;
  }
  return answers;
}
