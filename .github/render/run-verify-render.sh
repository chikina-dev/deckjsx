#!/usr/bin/env bash
set -euo pipefail

args=(--strict)
if [ -n "${DECKJSX_RENDER_FIXTURE_GROUP:-}" ]; then
  args+=(--fixture-group "$DECKJSX_RENDER_FIXTURE_GROUP")
fi
args+=("$@")

bun run .github/render/verify-render.tsx "${args[@]}"
