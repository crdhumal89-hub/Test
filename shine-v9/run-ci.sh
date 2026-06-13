#!/usr/bin/env bash
# SHINE v9 continuous-integration gate. Run locally for parity with CI:
#   ./run-ci.sh
# Exit non-zero on any failure. No third-party dependencies: standard-library
# Python 3.11+ and Node (for the dashboard syntax check inside the suite).
set -euo pipefail
cd "$(dirname "$0")"

echo "==> 1/4 unit + integration suite"
python3 -m unittest discover -s tests

echo "==> 2/4 regenerate golden library (deterministic)"
python3 -m harness.golden_gen

echo "==> 3/4 acceptance harness (rule_based) — gate must be GREEN"
python3 -m harness.runner

echo "==> 4/4 claude code-path certification (replay floor) — gate must be GREEN"
python3 -m harness.runner --adapter claude >/dev/null

echo "==> CI PASSED"
