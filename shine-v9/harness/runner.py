"""Acceptance harness: run the engine over the golden library, score it,
evaluate the acceptance gate, write the scorecard.

Scoring rules:
  TP    an expected defect matched by an emitted finding (root-cause findings
        match through their preserved constituents, so reconciliation never
        masks detection).
  FN    an expected defect no emitted finding matches.
  FP    an emitted, unsuppressed finding that matches no expected defect.
Precision = TP_findings / (TP_findings + FP). Recall = matched / expected.
Must-catch recall is computed over the must_catch subset and gates at 100%.

Additional gate checks: clean drafts emit zero findings; zero unverifiable
citations reach output; two runs on the same fixture produce identical
ledgers; no generated artifact contains an em dash.

Usage: python3 -m harness.runner
"""
from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from run_review import run, load_config        # noqa: E402
from schema.v8compat_validator import validate_v8compat  # noqa: E402

GOLDEN = ROOT / "golden"
TEXT_ARTIFACTS = ("findings.json", "coverage_manifest.json", "ledger.json",
                  "dashboard.html", "skeptic_decisions.json",
                  "reconciler_decisions.json", "telemetry.json")


def _matches(expected: dict, finding: dict) -> bool:
    units = [finding] + [c for c in (finding.get("reconciler") or {}).get("constituents", [])]
    for unit in units:
        if unit.get("category") != expected["category"]:
            continue
        if expected.get("relationship") and \
                (unit.get("evidence") or {}).get("relationship") != expected["relationship"]:
            continue
        if expected.get("check_id") and unit.get("check_id") != expected["check_id"]:
            continue
        # Escalation expectations: the TOP-LEVEL finding carries recurrence
        # and post-escalation severity (constituents are pre-collapse).
        if expected.get("recurrence") and \
                finding.get("prior_review_recurrence") != expected["recurrence"]:
            continue
        if expected.get("severity") and finding.get("severity") != expected["severity"]:
            continue
        return True
    return False


def score_fixture(name: str, result: dict, expected_list: list[dict]) -> dict:
    findings = result["findings"]
    matched_expected, missed = [], []
    used_finding_ids = set()
    for exp in expected_list:
        hit = next((f for f in findings if _matches(exp, f)), None)
        if hit is not None:
            matched_expected.append(exp)
            used_finding_ids.add(hit["id"])
        else:
            missed.append(exp)
    false_positives = [f for f in findings
                       if f["id"] not in used_finding_ids and not f.get("suppressed")]
    unverified = [f for f in findings
                  if f["source"] in ("standards", "regulatory")
                  and (f.get("evidence") or {}).get("citation_verified") is not True]
    return {
        "fixture": name,
        "expected": len(expected_list),
        "matched": len(matched_expected),
        "missed": [m["note"] for m in missed],
        "missed_must_catch": [m["note"] for m in missed if m["must_catch"]],
        "must_catch_total": sum(1 for e in expected_list if e["must_catch"]),
        "must_catch_hit": sum(1 for e in matched_expected if e["must_catch"]),
        "false_positives": [f.get("message", "(no message)")[:100] for f in false_positives],
        "unverified_citations_in_output": len(unverified),
        "is_clean_fixture": len(expected_list) == 0,
        "findings_emitted": len(findings),
        "verdict": result["verdict"]["state"],
    }


def scan_em_dashes(outputs_dir: Path) -> list[str]:
    hits = []
    for name in TEXT_ARTIFACTS:
        path = outputs_dir / name
        if path.is_file() and "—" in path.read_text(encoding="utf-8"):
            hits.append(name)
    return hits


def run_harness() -> dict:
    config = load_config()
    fixtures = sorted(p for p in GOLDEN.iterdir()
                      if p.is_dir() and (p / "expected_findings.json").is_file())
    if not fixtures:
        raise SystemExit("golden library is empty; run python3 -m harness.golden_gen first")

    rows, em_dash_hits, compat_violations = [], [], []
    determinism_ok = True
    with tempfile.TemporaryDirectory() as tmp:
        for folder in fixtures:
            work = Path(tmp) / folder.name
            shutil.copytree(folder, work)
            result = run(work, config)
            expected_list = json.loads((folder / "expected_findings.json").read_text())
            rows.append(score_fixture(folder.name, result, expected_list))
            em_dash_hits.extend(f"{folder.name}/{h}" for h in scan_em_dashes(work / "_outputs"))
            # BASE-shape contract: every compat finding validates against the
            # vendored v8.1.1-rc schema, every run.
            compat = json.loads((work / "_outputs" / "findings_v8compat.json").read_text())
            for cf in compat:
                errs = validate_v8compat(cf)
                if errs:
                    compat_violations.append({"fixture": folder.name,
                                              "finding": cf.get("id"), "errors": errs})

        # Determinism probe: same fixture twice, byte-identical ledger.
        probe_src = fixtures[0]
        l1 = (Path(tmp) / probe_src.name / "_outputs" / "ledger.json").read_text()
        probe2 = Path(tmp) / (probe_src.name + "_rerun")
        shutil.copytree(probe_src, probe2)
        run(probe2, config)
        l2 = (probe2 / "_outputs" / "ledger.json").read_text()
        determinism_ok = (l1 == l2)

    total_expected = sum(r["expected"] for r in rows)
    total_matched = sum(r["matched"] for r in rows)
    total_fp = sum(len(r["false_positives"]) for r in rows)
    must_total = sum(r["must_catch_total"] for r in rows)
    must_hit = sum(r["must_catch_hit"] for r in rows)
    clean_fp = sum(r["findings_emitted"] for r in rows if r["is_clean_fixture"])
    unverified = sum(r["unverified_citations_in_output"] for r in rows)

    tp_findings = total_matched   # one finding credited per expected match
    precision = tp_findings / (tp_findings + total_fp) if (tp_findings + total_fp) else 1.0
    recall = total_matched / total_expected if total_expected else 1.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
    must_catch_recall = must_hit / must_total if must_total else 1.0

    acceptance = config["acceptance"]
    gate = {
        "must_catch_recall_100pct": must_catch_recall >= acceptance["must_catch_recall"],
        "overall_recall": recall >= acceptance["overall_recall_min"],
        "overall_precision": precision >= acceptance["overall_precision_min"],
        "clean_drafts_zero_findings": clean_fp <= acceptance["clean_draft_max_findings"],
        "zero_unverifiable_citations_in_output": unverified == 0,
        "deterministic_ledgers": determinism_ok,
        "no_em_dashes_in_artifacts": not em_dash_hits,
        "v8compat_schema_valid": not compat_violations,
    }
    scorecard = {
        "scorecard_version": "9.0",
        "adapter": config.get("adapter"),
        "model_pin": config.get("model_pin"),
        "fixtures": len(rows),
        "expected_defects": total_expected,
        "matched": total_matched,
        "false_positives": total_fp,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "must_catch_total": must_total,
        "must_catch_hit": must_hit,
        "must_catch_recall": round(must_catch_recall, 4),
        "clean_fixture_findings": clean_fp,
        "unverified_citations_in_output": unverified,
        "em_dash_hits": em_dash_hits,
        "v8compat_violations": compat_violations,
        "gate": gate,
        "gate_green": all(gate.values()),
        "rows": rows,
    }
    return scorecard


def write_scorecard(scorecard: dict) -> None:
    out_json = ROOT / "harness" / "scorecard.json"
    out_json.write_text(json.dumps(scorecard, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    lines = [
        "# SHINE v9 Acceptance Scorecard", "",
        f"Adapter: {scorecard['adapter']} · Model pin: {scorecard['model_pin']}",
        f"Fixtures: {scorecard['fixtures']} · Expected defects: {scorecard['expected_defects']}", "",
        f"| Metric | Value |", f"|---|---|",
        f"| Precision | {scorecard['precision']:.4f} |",
        f"| Recall | {scorecard['recall']:.4f} |",
        f"| F1 | {scorecard['f1']:.4f} |",
        f"| Must-catch recall | {scorecard['must_catch_recall']:.4f} ({scorecard['must_catch_hit']}/{scorecard['must_catch_total']}) |",
        f"| False positives | {scorecard['false_positives']} |",
        f"| Clean-fixture findings | {scorecard['clean_fixture_findings']} |",
        f"| Unverifiable citations in output | {scorecard['unverified_citations_in_output']} |", "",
        "## Gate", "",
    ]
    for check, ok in scorecard["gate"].items():
        lines.append(f"- [{'x' if ok else ' '}] {check}")
    lines.append("")
    lines.append(f"**GATE {'GREEN' if scorecard['gate_green'] else 'RED'}**")
    lines.append("")
    misses = [(r["fixture"], r["missed"]) for r in scorecard["rows"] if r["missed"]]
    fps = [(r["fixture"], r["false_positives"]) for r in scorecard["rows"] if r["false_positives"]]
    if misses:
        lines.append("## Missed defects")
        for fixture, missed in misses:
            for m in missed:
                lines.append(f"- {fixture}: {m}")
        lines.append("")
    if fps:
        lines.append("## False positives")
        for fixture, messages in fps:
            for m in messages:
                lines.append(f"- {fixture}: {m}")
        lines.append("")
    (ROOT / "harness" / "scorecard.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    scorecard = run_harness()
    write_scorecard(scorecard)
    print(json.dumps({k: v for k, v in scorecard.items() if k != "rows"}, indent=2))
    return 0 if scorecard["gate_green"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
