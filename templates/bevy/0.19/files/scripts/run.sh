#!/bin/sh
# Run the game for the scaffolded build target ("native" or "web",
# chosen in the wizard and substituted into this file at scaffold time).
set -e
cd "$(dirname "$0")/.."

# shellcheck disable=SC2050 # constant by design: {{build_target}} is substituted at scaffold time
if [ "{{build_target}}" = "web" ]; then
  exec trunk serve
fi
exec cargo run
