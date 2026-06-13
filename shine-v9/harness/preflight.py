"""Pre-flight check: validate a review folder's inputs WITHOUT running the engine.

Catches input errors at the analyst's desk instead of mid-run: missing or
unparseable figures, a metadata file that does not resolve to a framework,
a notes file of the wrong shape, a tie-out map that references figure paths
that do not exist. Exit 0 clean, 1 problems found.

Usage: python3 -m harness.preflight <review_folder>
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ingest.discovery import load_review, HaltError      # noqa: E402
from frameworks.registry import select_framework          # noqa: E402
from frameworks.base import FrameworkError                # noqa: E402
from core.numbers import get_path                         # noqa: E402


def preflight(folder: str | Path) -> tuple[list[str], list[str]]:
    """Return (errors, warnings). Errors block a useful run; warnings degrade it."""
    errors: list[str] = []
    warnings: list[str] = []

    try:
        review = load_review(folder)
    except HaltError as e:
        return ([f"halt: {e}"], [])

    # Framework must resolve.
    try:
        framework = select_framework(review.metadata)
    except FrameworkError as e:
        errors.append(f"framework: {e}")
        framework = None

    # Figures sanity.
    figures = review.figures or {}
    if not figures.get("balance_sheet"):
        warnings.append("figures: no balance_sheet present; balance and tie-out checks will be skipped")
    if not figures.get("entity", {}).get("legal_name"):
        warnings.append("figures: entity.legal_name absent; entity verification limited")

    # Notes shape.
    notes = review.notes or {}
    if not isinstance(notes.get("notes"), list):
        errors.append("notes.json: expected an object with a 'notes' array")
    elif not notes["notes"]:
        warnings.append("notes.json: empty notes array; all disclosure checks will fire")

    # Tie-out map references real figure paths.
    tie_out = figures.get("tie_out") or {}
    for path in tie_out:
        if get_path(figures, path) is None:
            warnings.append(f"tie_out references figure path not present in statements: {path}")

    # Degradation chips from discovery (missing optional inputs).
    for chip in review.degradation_chips:
        warnings.append(f"input: {chip['input']} {chip['reason']}")

    # Metadata materiality sanity.
    pct = (review.metadata.get("materiality") or {}).get("planning_pct_of_nav")
    if pct is not None and not (0 < pct < 0.1):
        warnings.append(f"metadata: planning_pct_of_nav {pct} is outside the usual 0 to 10 percent range")

    return errors, warnings


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: python3 -m harness.preflight <review_folder>")
        return 2
    errors, warnings = preflight(argv[1])
    for w in warnings:
        print(f"WARN  {w}")
    for e in errors:
        print(f"ERROR {e}")
    if errors:
        print(f"\npre-flight FAILED: {len(errors)} error(s), {len(warnings)} warning(s)")
        return 1
    print(f"\npre-flight OK: 0 errors, {len(warnings)} warning(s). Ready to run.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
