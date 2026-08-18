#!/bin/sh
# Three test layers, per the FOUNDATION harness (tests/README.md).
set -e
cd "$(dirname "$0")/.."

echo "== unit: no vitest cases yet =="
echo "   add cases in tests/unit/ once the game has logic worth testing"

echo "== headless: production build =="
npm run build

echo "== eyeball: manual run checklist =="
echo "   ./scripts/run.sh  then confirm: game loads, sprite moves with arrows"
echo "   full checklist: tests/eyeball/checklist.md"
