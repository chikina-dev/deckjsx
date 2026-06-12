#!/usr/bin/env bash
set -uo pipefail

quick_iterations="${PPTX_BENCHMARK_QUICK_ITERATIONS:-1}"
deep_iterations="${PPTX_BENCHMARK_DEEP_ITERATIONS:-5}"

echo "Running quick PPTX writer benchmark (${quick_iterations} iteration(s))."
bun run benchmark:pptx -- --iterations "$quick_iterations" --strict
quick_status=$?

if [ "$quick_status" -eq 0 ]; then
  exit 0
fi

echo "::warning::Quick PPTX writer benchmark failed; running deeper benchmark diagnostics (${deep_iterations} iterations)."
echo "::group::Deep PPTX writer benchmark"
bun run benchmark:pptx -- --iterations "$deep_iterations" --strict
deep_status=$?
echo "::endgroup::"

if [ "$deep_status" -eq 0 ]; then
  echo "::notice::Quick PPTX writer benchmark failed, but deeper benchmark passed. Treating this as single-run timing variance."
  exit 0
fi

echo "::error::PPTX writer benchmark failed in both quick and deeper runs."
exit "$deep_status"
