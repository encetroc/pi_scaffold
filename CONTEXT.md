# pi_scaffold — Scafstak Context

Scafstak is a pi extension (distributable via `pi install`) that generates new,
AI-ready game projects from user answers to a wizard. It turns the FOUNDATION
step of the workflow pipeline into a repeatable command.

## Language

**Scafstak**:
The tool itself. Canonical name; the slash command is `/scafstak`. Everything
(extension code + templates) lives in one git-tracked repo, distributed via
`pi install`.

**Scaffold** (verb / noun):
Generating a new project on disk from a template plus the user's wizard answers.
_Avoid_: init, generate, create

**Wizard**:
The interactive question-and-answer flow inside pi that collects the user's
choices before scaffolding runs.
_Avoid_: questionnaire, form

**Tech stack**:
A pairing of language and framework that a template targets (e.g. rust/bevy,
js/phaser).
_Avoid_: language, framework, platform

**Template**:
A self-contained scaffolding asset: the file tree, variables, and questions
that produce a project for one tech stack at one framework version.
_Avoid_: recipe, boilerplate

**Framework version**:
The pinned engine/library version a template targets (e.g. Bevy 0.19,
Phaser 4.2.1). Distinct from any template revision.
_Avoid_: template version, engine

**FOUNDATION artifacts**:
The one-time context layer a scaffolded project must ship: git init, `docs/`
tree, `AGENTS.md`, `scripts/run.sh` + `scripts/test.sh`, test harness stub
(unit / headless / eyeball), `docs/decisions/`, `tickets.md`, `.gitignore`.
Source of truth: `foundation.md`.
_Avoid_: boilerplate, defaults

**Getting-started guide**:
Per-template setup/run instructions for its tech stack (system deps, WSL
quirks, canonical commands), authored by the agent from official docs during
template authoring. Embedded into the scaffolded project's `AGENTS.md`.
_Avoid_: setup notes, README

**Dry-run**:
Scaffolding a template into a temporary directory and verifying it (toolchain
present, harness runs) before a new template is accepted into the registry.

**Build target**:
For stack templates that support it, the runtime the scaffolded project targets
(e.g. Bevy: native via WSLg, or web via trunk). A wizard question; commands in
`manifest.json` differ per target.

**First commit**:
Scaffolding ends with `git init`, a commit of the scaffolded tree, and a wizard
question about the remote (none / add existing URL / create on GitHub via `gh`
and push).

**References**:
Authoring-time instruction sources for a template's getting-started guide —
official doc links, local md files, or both. The agent consults them when
writing template content.

**Project**:
The scaffolded output on disk. Named by the user; created at a chosen path.
