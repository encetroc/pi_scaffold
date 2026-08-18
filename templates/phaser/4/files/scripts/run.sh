#!/bin/sh
# Run the game's dev server (Vite, http://localhost:8080).
# server.host=true lets a Windows browser open it while the project lives in WSL2.
set -e
cd "$(dirname "$0")/.."

exec npm run dev
