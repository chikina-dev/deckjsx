#!/usr/bin/env bash
set -uo pipefail

quick_iterations="${NODE_RUNTIME_BENCHMARK_QUICK_ITERATIONS:-1}"
deep_iterations="${NODE_RUNTIME_BENCHMARK_DEEP_ITERATIONS:-5}"

echo "Running quick @deckjsx/node runtime benchmark (${quick_iterations} iteration(s))."
bun run benchmark:node -- --iterations "$quick_iterations" --strict
quick_status=$?

if [ "$quick_status" -eq 0 ]; then
  exit 0
fi

echo "::warning::Quick @deckjsx/node runtime benchmark failed; running deeper benchmark diagnostics (${deep_iterations} iterations)."
echo "::group::Deep @deckjsx/node runtime benchmark"
bun run benchmark:node -- --iterations "$deep_iterations" --strict
deep_status=$?
echo "::endgroup::"

if [ "$deep_status" -eq 0 ]; then
  echo "::notice::Quick @deckjsx/node runtime benchmark failed, but deeper benchmark passed. Treating this as single-run timing variance."
  exit 0
fi

echo "::error::@deckjsx/node runtime benchmark failed in both quick and deeper runs."
exit "$deep_status"
