# Command-driven wizard, tool-based authoring

The happy-path scaffold is a slash command (`/scafstak`) that drives the
interactive questionnaire itself with no LLM in the loop — deterministic and
zero token cost. Template authoring goes the other way: the agent, which already
has access to the user's LLMs inside pi, researches official docs (links or md
files), fills template files, and dry-run-verifies via `scafstak_*` tools. This
split keeps scaffolding fast and reliable while routing the genuinely creative
work (new stacks) through the model. Rejected: an LLM-driven wizard for the
happy path (slow, burn tokens on a repeatable task) and a fully hardcoded
authoring flow (can't leverage the model).
