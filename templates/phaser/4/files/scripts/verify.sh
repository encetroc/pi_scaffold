#!/bin/sh
# Full verification for a Phaser scaffold: install deps, then build.
# Run by the engine's full-depth verify (manifest.commands.verifyBuild).
set -e
cd "$(dirname "$0")/.."

npm install
npm run build
