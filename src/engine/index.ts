/**
 * Scafstak scaffold engine — public surface (pure, no pi APIs per ADR 0004).
 */

export {
 ManifestError,
 parseManifest,
 validateManifest,
 type Manifest,
 type ManifestCommands,
 type Question,
} from "./manifest.js";

export {
 QuestionError,
 resolvedAnswers,
 resolveQuestions,
 type ResolvedQuestion,
} from "./questions.js";

export {
 VariableError,
 isTransformName,
 resolveVariables,
 substituteTemplate,
 type Answers,
 type TransformName,
} from "./variables.js";

export {
 ScaffoldError,
 loadManifest,
 scaffold,
 type ScaffoldOptions,
 type ScaffoldResult,
} from "./scaffold.js";

export {
 FoundationError,
 generateFoundation,
} from "./foundation.js";
