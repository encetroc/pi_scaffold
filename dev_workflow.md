# The Workflow Pipeline (ordered)

```
FOUNDATION ─► RESEARCH ─► VISION ─► PROTOTYPE (spikes) ─► ARCHITECTURE
   one-time     kill-risk       one-pager      throwaway            after spikes
                                                prove mechanics      know what's real
     │
     ▼
SPECS ─► TICKETS ─► DEVTOOLS ─► IMPLEMENT ─► TEST ─► REVIEW ─► GIT
 per-feature  backlog     early ticket   1 ticket     3 layers     fresh-      commit
 testable     vertical    DevMenu/       at a time    unit/        context     per
              slices      cheats                      headless/    reviewer    ticket
                                                      eyeball
     ┌──────────────────────────────────────────────────────────────────────┘
     ▼
PLAYTEST/TUNE ─► loop back to TICKETS ─► RELEASE (build/package/itch.io)
```

## Step Responsibilities & Handoffs

| Step | Responsible for | Hands to next step |
| --- | --- | --- |
| **FOUNDATION** | One-time project scaffolding: repo, `docs/` tree, `AGENTS.md`, test harness stub, `scripts/{run,test}.sh`, decision log. Makes every future session start with full context. | Working repo + docs skeleton + runnable harness → RESEARCH knows where to write findings |
| **RESEARCH** | Kill technical risk early: verify engine/API capabilities, platform constraints, library choices. Output cited findings + go/no-go call. | `docs/research/*.md` with citations + feasibility verdict → VISION grounded in what's possible |
| **VISION** | One-page GDD: core loop, design pillars, scope boundaries, target platform, tech stack. The alignment contract for everything after. | One-pager `docs/vision.md` → PROTOTYPE knows which mechanics to prove |
| **PROTOTYPE** | Throwaway spikes that prove the risky mechanics/feel. Code is disposable; knowledge is the product. Kill or extract. | Learnings doc (what works, what doesn't, real constraints) → ARCHITECTURE designed from facts, not guesses |
| **ARCHITECTURE** | System design written *after* spikes: module boundaries, data flow, state model, key patterns. Recorded as ADRs. | `docs/architecture.md` + `docs/decisions/` ADRs → SPECS inherit structure and constraints |
| **SPECS** | Per-feature testable specs: behavior, acceptance criteria, tuning parameters, edge cases. One spec per feature, reviewed/grilled before tickets. | `docs/specs/<feature>.md` with acceptance criteria → TICKETS has unambiguous source material |
| **TICKETS** | Break specs into vertical-slice backlog items: small, independently playable/testable, ordered by dependency. | Prioritized backlog (`tickets.md` / beads) → DEVTOOLS + IMPLEMENT pull one ticket at a time |
| **DEVTOOLS** | Early-ticket tooling: DevMenu, cheats, free-cam, debug overlays, spawn/skip controls. Built in first slices, not bolted on later. | In-game debug capabilities → IMPLEMENT/TEST/PLAYTEST all run faster and observable |
| **IMPLEMENT** | Write code for exactly one ticket at a time. Small diffs, follow spec + architecture, no scope creep. | Working code for the ticket → TEST has something concrete to verify |
| **TEST** | 3 layers: unit (pure logic), headless smoke (jsdom/fengari boot checks), eyeball (real run on target). Gate before review. | Green test results + evidence → REVIEW sees verified code, not hopeful code |
| **REVIEW** | Fresh-context reviewer: correctness, spec compliance, architecture fit, quality. Independent of the writer. | Findings list → fixes applied in parent, then GIT gets clean reviewed state |
| **GIT** | Commit per ticket, conventional messages, tag per playable build. History = audit trail. | Clean committed state + tagged builds → PLAYTEST/TUNE tests a known version |
| **PLAYTEST/TUNE** | Human plays, notes feel/balance/fun, tunes parameters. Source of truth for "is it good". | `docs/playtests/` notes → loops back to TICKETS as new backlog items |
| **RELEASE** | Build, package, publish (itch.io via `butler`). Versioned, reproducible artifacts. | Shipped build + release notes → players; feedback restarts loop at TICKETS |
