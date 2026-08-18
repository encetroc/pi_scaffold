# FOUNDATION Step — How-To

> One-time project scaffolding. Done before any game code exists.
> Source: `workflow-pipeline.md` + `game-dev-ai-workflow.md` (pi_workflow_test).

---

## 1. What FOUNDATION is

FOUNDATION is the first step of the pipeline:

```text
FOUNDATION ─► RESEARCH ─► VISION ─► PROTOTYPE (spikes) ─► ARCHITECTURE
```

It is **one-time**: you build it once per project, and never repeat it.
It is the **context layer**: it gives every future session (human or AI agent) full
context the moment they open the repo.

Core idea: **AI value = context quality.** A game project fails fast when an agent
starts a session with zero knowledge of the stack, the commands, or the conventions.
FOUNDATION removes that cold start by making the repo self-explanatory.

### Key insight from the workflow notes

> "Foundation first — AI value = context quality. Docs skeleton + `AGENTS.md` +
> test harness + decision log exist before any code, so every future session
> starts smart."

## 2. Responsibilities (from the pipeline table)

| FOUNDATION is responsible for | Purpose |
| --- | --- |
| Repository init | Version-controlled working tree from day 1 |
| `docs/` tree | Home for every later step's output (research, specs, ADRs, playtests) |
| `AGENTS.md` | Agent-facing project map: stack, commands, conventions |
| Test harness stub | Empty-but-runnable test runner, so TEST step has a home |
| `scripts/run.sh` / `scripts/test.sh` | Canonical commands — no "how do I run this?" ever again |
| Decision log | `docs/decisions/` for ADRs, mirroring agent memory |

### Handoff

When done you hand to RESEARCH:

> Working repo + docs skeleton + runnable harness → RESEARCH knows where to write findings

## 3. What each artifact contains

### `AGENTS.md`

The single most important file for AI-assisted development. It tells the next
agent session everything needed to work without asking:

- **Stack**: engine, language, versions (e.g. Phaser 4 / JS, Bevy 0.19 / Rust)
- **Commands**: `./scripts/run.sh` to launch, `./scripts/test.sh` to verify
- **Conventions**: how code is organized, how tests are written (3 layers)
- **Docs map**: where research findings, specs, ADRs, playtest notes live
- **Workflow pointer**: "read `docs/` before editing, commit per ticket"

### `docs/` tree

```text
docs/
├── research/      # RESEARCH step output: cited findings + go/no-go verdicts
├── specs/         # SPECS step output: one per-feature testable spec
├── decisions/     # ARCHITECTURE step output: ADRs, decision log
├── playtests/     # PLAYTEST step output: feel/balance notes
├── vision.md      # VISION step: one-page GDD
└── architecture.md# ARCHITECTURE step: system design
```

Every later step has a pre-allocated home — no step ever wonders where to write.

### `scripts/run.sh` and `scripts/test.sh`

- `run.sh` — launches the game (dev server, dev build, or platform run)
- `test.sh` — runs the test harness (all 3 layers: unit, headless smoke, eyeball)
- Must be executable (`chmod +x`) and work on the dev machine (WSL: `cargo -j 8`, etc.)

These become the canonical verbs for every future session: *"run it"* and
*"verify it"* have exactly one answer each.

### Test harness stub

Empty but structurally complete:

- Unit layer — pure logic tests (framework TBD by stack: vitest, cargo test, busted)
- Headless smoke layer — boot checks (jsdom for Phaser, fengari for LÖVE)
- Eyeball layer — manual real-run checklist (game boots, window opens, no crash)

A stub means the TEST step inherits a known place to add cases, instead of
inventing test infrastructure mid-project.

### Decision log (`docs/decisions/`)

- ADR-style entries: context → decision → consequences
- Mirrored in agent memory; **never rewritten**, only appended
- Future sessions read it to understand *why* the project is shaped the way it is

### `.gitignore` + `tickets.md`

- `.gitignore` — build artifacts, node_modules, target/, .DS_Store never committed
- `tickets.md` — empty backlog; TICKETS step fills it with vertical slices

## 4. Do / Don't

| Do | Don't |
| --- | --- |
| Scaffold structure before code | Write game logic during FOUNDATION |
| Make scripts runnable immediately | Leave harness as empty TODO file |
| Keep AGENTS.md accurate | Rewrite decision log entries (append only) |
| Init git on day 1 | Bolted-on tooling later |

## 5. Executing FOUNDATION — concrete steps

### Option A: one-command scaffold script (`new-game.sh`)

Recommended. A reusable script per `game-dev-ai-workflow.md` §6.2:

```bash
#!/usr/bin/env bash
set -euo pipefail
# new-game.sh — scaffold a new game project per the workflow pipeline
# Usage: new-game.sh <project-name>

name="${1:?usage: new-game.sh <project-name>}"
mkdir -p "$name" && cd "$name"

git init
mkdir -p docs/research docs/specs docs/decisions docs/playtests
touch docs/vision.md docs/architecture.md
touch AGENTS.md tickets.md .gitignore
touch scripts/run.sh scripts/test.sh
chmod +x scripts/run.sh scripts/test.sh

echo "scaffolded $name — now fill AGENTS.md, scripts, and harness stub"
```

Then per project: `./new-game.sh my-game`, edit the stubs, done.

### Option B: manual

1. `git init` + `.gitignore`
2. Create the `docs/` tree (section 3)
3. Write `AGENTS.md` (stack, commands, conventions, docs map)
4. Write `scripts/run.sh` + `scripts/test.sh`, `chmod +x`
5. Create test harness stub (3 layers, empty)
6. Touch `tickets.md`, create `docs/decisions/`
7. Verify: `./scripts/test.sh` exits green (even if it just says "no tests yet")

## 6. Definition of done / verification

FOUNDATION is complete when:

- [ ] Repo initialized, clean `.gitignore`
- [ ] `docs/` tree exists with all 6 locations
- [ ] `AGENTS.md` written: stack, commands, conventions, docs map
- [ ] `scripts/run.sh` + `scripts/test.sh` executable and runnable
- [ ] Harness stub present (unit / headless / eyeball layers declared)
- [ ] `docs/decisions/` + `tickets.md` exist
- [ ] A fresh agent session can read the repo and start RESEARCH without asking questions

**Handoff:** working repo + docs skeleton + runnable harness → RESEARCH knows where to write findings.

---

*Maintained as part of pi_workflow_test — mirrors workflow-pipeline.md FOUNDATION row.*
