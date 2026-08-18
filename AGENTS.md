# AGENTS.md

This repo is **scafstak** — a pi extension that scaffolds AI-ready game projects
(automating the FOUNDATION step of the workflow pipeline), plus the workflow
docs that define it.

## Repo map

- `dev_workflow.md` — the full workflow pipeline (FOUNDATION → RESEARCH → … → RELEASE)
- `foundation.md` — what the FOUNDATION step must produce; the scaffolded-project contract
- `docs/scafstak-design.md` — the grilled, user-confirmed v1 design for the tool
- `CONTEXT.md` — domain glossary; use its vocabulary in issues, specs, and code
- `docs/adr/` — architectural decisions (0001–0004)
- `docs/agents/` — issue-tracker, triage-label, and domain-doc conventions (below)
- `.agents/skills/` — the engineering skills this repo uses
- `skills-lock.json` — locked sources for those skills

Read `CONTEXT.md` and relevant ADRs before editing. Status: **design complete,
no tool code built yet** — the build awaits `/tickets`-sourced work from the
issue tracker.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues on `encetroc/pi_scaffold`, driven via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
