"""Disposition learning loop.

Controller dispositions (the post-review state of findings.json) feed two
records:

threshold record  config/feedback.json accumulates per-category accept and
                  discard counts. A category whose discard rate climbs is a
                  candidate for prompt or threshold tuning at the steward's
                  quarterly review.
golden candidates discarded findings are nominated as false-positive fixtures
                  and accepted CRITICALs as must-catch fixtures for the golden
                  library, so the engine's test corpus grows with use.

Usage: python3 -m ledger.dispositions <path/to/findings.json>
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FEEDBACK_PATH = ROOT / "config" / "feedback.json"


def load_feedback(path: Path = FEEDBACK_PATH) -> dict:
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"feedback_version": "9.0", "by_category": {}, "golden_candidates": []}


def record_dispositions(findings: list[dict], feedback: dict) -> dict:
    for f in findings:
        cat = feedback["by_category"].setdefault(
            f["category"], {"accepted": 0, "resolved": 0, "discarded": 0, "open": 0})
        state = f.get("state", "OPEN").lower()
        key = state if state in ("accepted", "resolved", "discarded") else "open"
        cat[key] += 1
        if state == "discarded":
            feedback["golden_candidates"].append({
                "kind": "false_positive_fixture", "category": f["category"],
                "check_id": f.get("check_id"), "message": f["message"][:160]})
        elif state in ("accepted", "resolved") and f["severity"] == "CRITICAL":
            feedback["golden_candidates"].append({
                "kind": "must_catch_fixture", "category": f["category"],
                "relationship": (f.get("evidence") or {}).get("relationship"),
                "message": f["message"][:160]})
    return feedback


def save_feedback(feedback: dict, path: Path = FEEDBACK_PATH) -> None:
    path.write_text(json.dumps(feedback, sort_keys=True, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: python3 -m ledger.dispositions <findings.json>")
        return 2
    findings = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    feedback = record_dispositions(findings, load_feedback())
    save_feedback(feedback)
    print(f"recorded {len(findings)} dispositions; "
          f"{len(feedback['golden_candidates'])} golden candidates accumulated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
