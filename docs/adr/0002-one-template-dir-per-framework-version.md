# One template directory per framework version

Templates live at `templates/<stack>/<version>/`, one self-contained directory
per framework version (e.g. `bevy/0.19/`, `phaser/4/`). A version can be added,
updated, or retired independently without cascading into others, and the wizard
shows a version picker when a stack has more than one. Rejected: a single
template per stack with an internal version matrix, which couples versions and
makes one version's update ripple through the others.
