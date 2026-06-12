"""Batch runner: review every fund folder under a root in one invocation.

The scale path for quarter-end: 30 to 50 fund reviews run sequentially with
one summary table and machine-readable batch results. Each review is fully
independent (own ledger, own outputs); a failure in one fund never blocks the
rest, and every failure is reported, never swallowed.

Usage:
  python3 run_batch.py <root_folder> [--config path]

A review folder is any directory containing inputs/figures.json. Exit code 0
when every review ran and reached READY; 1 when any review is NOT_READY or
READY_WITH_EXCEPTIONS; 2 when any review failed to run.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from run_review import run, load_config   # noqa: E402


def discover_review_folders(root: Path) -> list[Path]:
    return sorted({p.parent.parent for p in root.rglob("inputs/figures.json")})


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: python3 run_batch.py <root_folder> [--config path]")
        return 2
    root = Path(argv[1])
    config = load_config(argv[argv.index("--config") + 1]) if "--config" in argv else load_config()

    folders = discover_review_folders(root)
    if not folders:
        print(f"no review folders (inputs/figures.json) found under {root}")
        return 2

    results, failures = [], []
    for folder in folders:
        try:
            r = run(folder, config)
            results.append({
                "review": str(folder.relative_to(root)),
                "run_id": r["ledger"]["run_id"],
                "verdict": r["verdict"]["state"],
                "findings": len(r["findings"]),
                "critical": sum(1 for f in r["findings"] if f["severity"] == "CRITICAL"),
                "high": sum(1 for f in r["findings"] if f["severity"] == "HIGH"),
                "scope_coverage_pct": round(r["coverage"]["scope_coverage_pct"], 4),
                "outputs": r["outputs_dir"],
            })
        except Exception as e:   # reported, never swallowed
            failures.append({"review": str(folder), "error": f"{type(e).__name__}: {e}"})

    print(f"{'REVIEW':<42} {'VERDICT':<22} {'FINDINGS':>8} {'CRIT':>5} {'HIGH':>5} {'SCOPE':>7}")
    for row in results:
        print(f"{row['review']:<42} {row['verdict']:<22} {row['findings']:>8} "
              f"{row['critical']:>5} {row['high']:>5} {row['scope_coverage_pct']:>7.2%}")
    for failure in failures:
        print(f"FAILED  {failure['review']}: {failure['error']}")

    batch = {"results": results, "failures": failures,
             "ready": sum(1 for r in results if r["verdict"] == "READY"),
             "total": len(folders)}
    (root / "_outputs_batch_summary.json").write_text(
        json.dumps(batch, sort_keys=True, indent=2) + "\n", encoding="utf-8")

    if failures:
        return 2
    if any(r["verdict"] != "READY" for r in results):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
