# Single-source naming from the project name

The `/scafstak` wizard asks one text question — the project name — and every
site that needs a name is derived from it. The target directory is
`./<project-name>`; template naming questions (window/game title, crate,
package, repo name) come from defaults that transform the project name, and a
template question with a `default` is answered silently from that default. A
template question with **no** default fails loudly at scaffold time rather than
prompting, so the wizard stays one-question for well-formed templates and
surfaces authoring bugs.

The case transforms (`snake_case`, `kebab-case`, …) live in
`src/engine/variables.ts`; the template declares the derived variables it needs
(e.g. `project_name_snake`) and the wizard resolves them from the defaults. The
repo name in the create-via-`gh` remote flow is derived as kebab-case of the
project name rather than prompting.

Rejected: prompting separately for each naming site (target directory, window/
game title, crate, package, repo name), which burdens the user with redundant
questions when a default already exists.
