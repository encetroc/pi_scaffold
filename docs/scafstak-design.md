# Scafstak — v1 Design

Scafstak is a pi extension that scaffolds AI-ready game projects from a wizard.
It automates the FOUNDATION step of the workflow pipeline (`dev_workflow.md`,
`foundation.md`). This document is the contract for the build session — nothing
here is guessed, everything was grilled and confirmed.

## What it is

- **One slash command** `/scafstak` drives the happy path: interactive
  questionnaire, deterministic scaffold, no LLM in the loop, zero token cost.
- **Three tools** let the pi agent do template work: `scafstak_list`,
  `scafstak_new_template`, `scafstak_verify_template` (ADR 0004).
- **Manifest-driven**: each template declares its own questions, variables,
  commands (ADR 0001). New stacks don't touch extension code.
- **One git-tracked package**: extension code + `templates/` versioned together,
  distributed via `pi install` (ADR 0003).

## Repo layout

```text
pi_scaffold/
├── package.json            # name: scafstak, keywords: [pi-package], pi.extensions → ./extensions
├── extensions/
│   ├── scafstak.ts         # entry: command + tools
│   └── wizard.ts           # questionnaire UI (adapted from pi's questionnaire.ts example)
├── templates/
│   ├── bevy/0.19/          # manifest.json + getting-started.md + files/
│   └── phaser/4/           # same
├── CONTEXT.md
├── docs/
│   ├── adr/0001..0004
│   └── scafstak-design.md  # this file
├── dev_workflow.md
└── foundation.md
```

**Install / dev loop**: source of truth is this repo. Dev: symlink
`~/.pi/agent/extensions/scafstak` → repo (hot-reloads via `/reload`).
Distribution: `pi install git:github.com/<owner>/pi_scaffold` when public.

## `/scafstak` command flow

1. Select **stack** (bevy, phaser, …)
2. Select **framework version** — only when stack has >1 template
3. **Project name** (the one text input). Template questions with a `default`
   are answered silently from that default; one with no default fails loudly
   rather than prompting (#23)
4. Summary confirm
5. Scaffold: copy `files/`, substitute `{{var}}`, build FOUNDATION artifacts
6. `git init` + **first commit** (`scaffold: initial project`) — always
7. **Remote question**: None / add existing URL / create GitHub repo via `gh` + push
8. Verify per choice: Light (toolchain check) / Full (build) / Skip
9. Next-steps printout: `cd <name> && ./scripts/run.sh`, docs map

Args: `/scafstak bevy`, `/scafstak bevy 0.19` preselect. Tab completion on args.
Non-TUI mode (RPC/print): clean error, no hang.

## Manifest schema

`templates/<stack>/<version>/manifest.json`:

```json
{
  "name": "bevy-0.19",
  "stack": "bevy",
  "frameworkVersion": "0.19",
  "language": "rust",
  "buildTargets": ["native", "web"],
  "questions": [
    { "id": "window_title", "label": "Window title", "default": "{{project_name}}" },
    { "id": "crate_name", "label": "Crate name", "default": "{{project_name_snake}}" }
  ],
  "variables": { "project_name_snake": "{{project_name}} -> snake_case" },
  "commands": {
    "run": "./scripts/run.sh",
    "test": "./scripts/test.sh",
    "verifyCheck": ["cargo", "--version"],
    "verifyBuild": ["cargo", "check"]
  },
  "gettingStarted": "getting-started.md",
  "references": ["https://bevy.org/learn/", "docs/bevy-setup.md"]
}
```

- `{{var}}` substitution in file **content and filenames** inside `files/`
- `gettingStarted` embedded into scaffolded `AGENTS.md` as a Setup section
- `references` = authoring-time doc sources (links and/or md files)
- `buildTargets` filtered to one choice in the wizard; commands differ per target

## Wizard questions

**Generic (every stack)**: project name (one text input; target dir derived
`./<project-name>`; framework version (when >1) a select; verify choice a
select). No other text prompt. Template questions with a `default` are answered
silently from that default — no prompt. A template question with **no** default
fails loudly ("question X has no answer and no default") instead of prompting
(#23). The GitHub repo name (create via `gh` flow) is derived as kebab-case of
the project name, not prompted.

**Bevy 0.19 (native/web)** — silent defaults:

- Window title (default: project name)
- Crate name (default: snake_case project name)
- Build target: Native / Web (default: native, not prompted; edit post-scaffold)

**Phaser 4 (JS)** — silent defaults:

- Game title (default: project name)
- Canvas size (default 960×480, not prompted; edit post-scaffold)
- npm package name (default: kebab-case project name)

## Template anatomy

```
templates/<stack>/<version>/
├── manifest.json
├── getting-started.md      # cited, from official docs; → AGENTS.md Setup section
└── files/                  # copied; {{var}} substituted
```

Bevy: minimal 2D demo (camera2d + sprite + text), `bevy = "0.19"` pinned exact,
getting-started with WSL system deps (`build-essential libasound2-dev
libudev-dev pkg-config libwayland-dev libxkbcommon-dev libx11-dev libxrandr-dev
libxi-dev libxcursor-dev wayland-protocols`), `cargo -j 8` (3.8Gi RAM),
WSLg note.

Phaser: single JS scene + moving sprite + error banner hook, `phaser@^4.2.1`,
Vite 8 `server.host=true` (Windows browser from WSL), Node 24.

Both ship FOUNDATION artifacts: `docs/` tree (research/specs/decisions/
playtests/vision/architecture), `AGENTS.md` (stack, commands, conventions,
docs map, workflow pointer, embedded getting-started), `scripts/run.sh` +
`scripts/test.sh` (executable), test harness stub (unit/headless/eyeball
layers), `tickets.md`, `.gitignore`.

## AI authoring flow (new stack / new version)

1. User: `/scafstak new-stack` (or agent calls `scafstak_new_template` with
   stack, version, language, frameworkVersion, optional `--source <project>`
   to harvest, optional `--docs <links-or-md>`)
2. Command creates skeleton: `manifest.json` + `files/` + `getting-started.md`
   placeholder
3. Extension kicks the agent (`pi.sendUserMessage`) — pi's own LLM access:
   research official docs from `references`, fill `files/`, write cited
   `getting-started.md`
4. `scafstak_verify_template` dry-run: scaffold to temp dir, run verify
   commands, report pass/fail
5. User reviews, commits

## Tools

| Tool | Purpose |
| --- | --- |
| `scafstak_list` | List stacks, versions, languages, build targets |
| `scafstak_new_template` | Create template skeleton (or harvest from existing project) |
| `scafstak_verify_template` | Dry-run: temp scaffold + verify commands |

## Out of scope (v1)

- 3D Bevy template, TS Phaser template, trunk/WASM build — later templates
- Separate templates repo / runtime pull-updates (ADR 0003 says no)
- LLM-driven wizard for the happy path (ADR 0004 says no)
- Auto-handoff into a fresh pi session after scaffold

## Verification of the tool itself

- `scafstak_verify_template` passes for both shipped templates on this machine
  (toolchain present: cargo 1.97.1, node 24)
- `/scafstak` happy path scaffolds + commits + (optionally) pushes
- A fresh agent session in a scaffolded project can start RESEARCH without
  asking questions (foundation.md's definition of done)
