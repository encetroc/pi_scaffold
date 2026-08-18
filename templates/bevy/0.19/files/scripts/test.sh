#!/bin/sh
# Three test layers, per the FOUNDATION harness (tests/README.md).
set -e
cd "$(dirname "$0")/.."

echo "== unit: cargo test =="
cargo test

echo "== headless: no boot-smoke cases yet =="
echo "   add cases in tests/headless/ once the game has an API worth booting"

echo "== eyeball: manual run checklist =="
echo "   ./scripts/run.sh  then confirm: window opens, sprite moves with arrows"
echo "   full checklist: tests/eyeball/checklist.md"
