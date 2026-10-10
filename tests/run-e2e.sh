#!/usr/bin/env bash
# Builds the app against the local emulators, serves it, and runs the two-phone test.
set -euo pipefail
VITE_USE_EMULATORS=1 npx vite build --outDir dist-e2e >/dev/null
npx vite preview --outDir dist-e2e --port 4173 --strictPort >/dev/null 2>&1 &
PREVIEW=$!
trap 'kill $PREVIEW 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do curl -sf http://localhost:4173 >/dev/null && break; sleep 0.5; done
node tests/e2e-offline-sync.mjs
