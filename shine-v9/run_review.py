"""SHINE v9 orchestrator. Thin by mandate: it coordinates, it does not review.

Pipeline: load -> framework -> core (deterministic arithmetic) -> judges ->
citation verification -> schema validation -> skeptic -> reconciler ->
suppression -> sort and number -> coverage -> readiness -> ledger -> render.

Usage: python3 run_review.py <review_folder> [--config path]
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from core.engine import run_core, ENGINE_VERSION, SCHEMA_VERSION          # noqa: E402
from evidence.corpus import load_corpus                                    # noqa: E402
from evidence.verifier import CitationVerifier                             # noqa: E402
from frameworks.registry import select_framework                          # noqa: E402
from ingest.discovery import load_review                                  # noqa: E402
from ingest.outputs import outputs_dir, write_json, write_text, write_bytes  # noqa: E402
from judges.adapter import make_adapter                                   # noqa: E402
from judges.common import PROMPT_VERSION                                  # noqa: E402
from judges.dispatch import run_judges                                    # noqa: E402
from ledger.run_ledger import build_ledger, finalize_ledger, serialize_ledger  # noqa: E402
from reconcile.calibration import apply_suppression                       # noqa: E402
from reconcile.reconciler import run_reconciler                           # noqa: E402
from render.dashboard import render_dashboard                             # noqa: E402
from render.exports import render_export                                  # noqa: E402
from schema.validator import validate_all                                 # noqa: E402
from skeptic.skeptic import run_skeptic                                   # noqa: E402


def load_config(path: str | None = None) -> dict:
    config_path = Path(path) if path else ROOT / "config" / "default.json"
    return json.loads(config_path.read_text(encoding="utf-8"))


def compute_readiness(findings: list[dict], completeness: float) -> dict:
    blocking = [f for f in findings
                if f["severity"] in ("CRITICAL", "HIGH")
                and f["state"] in ("OPEN", "ACCEPTED") and not f.get("suppressed")]
    if blocking or completeness < 0.85:
        drivers = []
        crit = sum(1 for f in blocking if f["severity"] == "CRITICAL")
        high = sum(1 for f in blocking if f["severity"] == "HIGH")
        if crit:
            drivers.append(f"{crit} critical unresolved")
        if high:
            drivers.append(f"{high} high unresolved")
        if completeness < 0.85:
            drivers.append(f"coverage {completeness:.0%} below 85 percent")
        return {"state": "NOT_READY", "driver": " · ".join(drivers)}
    if completeness < 0.95:
        return {"state": "READY_WITH_EXCEPTIONS",
                "driver": f"only medium/low residual; coverage {completeness:.0%} between 85 and 95 percent"}
    return {"state": "READY",
            "driver": "no unresolved critical or high findings; coverage at or above 95 percent"}


def _sort_and_number(findings: list[dict], framework) -> list[dict]:
    order = ["Cover"] + [framework.statement_name(k)
                         for k in framework.fs_page_order + ["notes", "tie_out"]]

    def key(f):
        stmt = f["statement"]
        return (order.index(stmt) if stmt in order else 99,
                f["sort_order"], f["category"], f["message"])

    ordered = sorted(findings, key=key)
    for i, f in enumerate(ordered, start=1):
        f["id"] = f"F-{i:03d}"
    return ordered


def _app_shape(findings: list[dict], meta: dict, coverage: dict, verdict: dict) -> dict:
    """Project v9 findings into the v8 dashboard-app shape for shine-app import."""
    sev_rank = {"NOT_READY": "NOT_READY", "READY_WITH_EXCEPTIONS": "READY_WITH_EXCEPTIONS",
                "READY": "READY"}
    return {
        "brief": {
            "review_id": meta.get("review_id", "v9-run"),
            "fund_code": meta.get("fund_code", ""), "fund_legal_name": meta.get("legal_name", ""),
            "domicile": meta.get("domicile", ""), "structure_type": meta.get("structure_type", ""),
            "period": meta.get("period", ""), "draft": meta.get("draft", ""),
            "regulatory_jurisdictions": meta.get("regulatory_jurisdictions", []),
            "materiality_planning_value": None, "clearly_trivial_value": None,
            "materiality_planning_pct": meta.get("materiality", {}).get("planning_pct_of_nav", 0),
            "build_date": "v9", "readiness": sev_rank[verdict["state"]],
        },
        "coverage": {
            "coverage_completeness_pct": coverage.get("completeness_pct", 1.0),
            "asc_paragraphs_applicable_count": coverage.get("checked_count", 0),
            "asc_paragraphs_checked_count": coverage.get("checked_count", 0),
            "asc_paragraphs_skipped_with_reason": [], "layers_covered": [],
            "layers_skipped": [], "subagents_completed": [], "subagent_timeouts_fired": [],
            "regulatory_citations_referenced": [], "regulatory_corpus_attestation_age_days": {},
            "subagent_elapsed_seconds": {}, "schema_rejections": {"total": 0, "by_subagent": {}},
        },
        "findings": [{
            "id": f["id"], "subagent": f["source"], "layer": f.get("legacy_layer") or "L0",
            "statement": f["statement"], "section": f["section"], "sortOrder": f["sort_order"],
            "location": {"statement": f["statement"], "line_id": f["location"].get("line_id"),
                         "note_ref": f["location"].get("note_id"), "page": None},
            "severity": {"impact": f["severity"], "confidence": f["confidence_label"]},
            "subagentRaw": f["message"], "voiceNormalized": None, "controllerEdited": None,
            "fix": f["fix"], "fixSubagentRaw": f["fix"], "fixVoiceNormalized": None,
            "evidence": {"asc_reference": f["evidence"].get("citation_key")
                         if (f["evidence"].get("citation_key") or "").startswith(("ASC", "IFRS", "IAS")) else None,
                         "regulatory_citation": f["evidence"].get("citation_key")
                         if ":" in (f["evidence"].get("citation_key") or "") else None,
                         "quoted_text": f["evidence"].get("quoted_text")},
            "merge_key": f["merge_key"], "finding_class": f["category"],
            "prior_review_recurrence": "NEW", "evergreen_accepted": False,
            "subagent_version": f["versions"]["engine"], "prompt_version": f["versions"].get(
                "prompt_versions", {}).get("judges", "rb-9.0.0"),
            "reference_versions": f["versions"].get("corpus_versions", {}),
            "state": f["state"],
        } for f in findings],
    }


def run(review_folder: str | Path, config: dict | None = None) -> dict:
    t0 = time.monotonic()
    config = config or load_config()
    timings: dict = {}

    review = load_review(review_folder)
    framework = select_framework(review.metadata)
    corpus = load_corpus(ROOT, config["corpus"]["authority_corpus_paths"])
    verifier = CitationVerifier(corpus)
    timings["ingest"] = time.monotonic() - t0

    versions = {
        "engine": ENGINE_VERSION, "schema": SCHEMA_VERSION,
        "adapter": config.get("adapter", "rule_based"),
        "model_pin": config.get("model_pin", ""),
        "prompt_versions": {"judges": PROMPT_VERSION},
        "corpus_versions": dict(sorted(corpus.file_hashes.items())),
    }
    figures = dict(review.figures)
    figures["metadata_materiality_pct"] = review.metadata.get(
        "materiality", {}).get("planning_pct_of_nav")

    t = time.monotonic()
    core_findings, core_coverage = run_core(figures, config, framework, versions)
    timings["core"] = time.monotonic() - t

    ctx = {
        "figures": review.figures, "notes": review.notes, "metadata": review.metadata,
        "manifest": review.manifest, "prior_figures": review.prior_figures,
        "sibling_figures": review.sibling_figures, "framework": framework,
        "config": config, "versions": versions,
    }
    adapter = make_adapter(config)
    t = time.monotonic()
    judge_findings, judge_coverage = run_judges(ctx, adapter)
    timings["judges"] = time.monotonic() - t

    # Citation verification: unverifiable citations are rejected here and can
    # never reach the dashboard or exports.
    rejected: list[dict] = []
    verified_judges = []
    for f in judge_findings:
        if verifier.stamp_finding(f):
            verified_judges.append(f)
        else:
            rejected.append({"finding": f, "reasons": ["citation: key did not resolve to corpus text"]})

    candidates = core_findings + verified_judges
    valid, schema_rejected = validate_all([{**f, "id": "F-000"} for f in candidates])
    rejected.extend(schema_rejected)

    t = time.monotonic()
    surviving, skeptic_log = run_skeptic(valid, ctx, config)
    timings["skeptic"] = time.monotonic() - t

    reconciled, reconciler_log = run_reconciler(surviving, framework)
    reconciled, suppressed_count = apply_suppression(reconciled, config)
    findings = _sort_and_number(reconciled, framework)

    # Coverage roll-up: every check either ran or carries a reason-coded skip.
    checked = list(core_coverage["checked"])
    skipped = list(core_coverage["skipped"])
    for judge, cov in judge_coverage.items():
        checked.extend(f"{judge}:{c}" for c in cov["checked"])
        skipped.extend({**s, "judge": judge} for s in cov["skipped"])
    unreasoned = [s for s in skipped if not s.get("reason_code")]
    completeness = len(checked) / max(1, len(checked) + len(unreasoned))
    coverage = {
        "checked": sorted(checked), "skipped": skipped,
        "checked_count": len(checked), "skipped_count": len(skipped),
        "skips_without_reason": len(unreasoned),
        "completeness_pct": completeness,
        "citations": {"verified": sum(1 for e in verifier.log if e["verified"]),
                      "rejected": sum(1 for e in verifier.log if not e["verified"])},
        "degradation_chips": review.degradation_chips,
    }
    verdict = compute_readiness(findings, completeness)

    ledger = finalize_ledger(build_ledger(review.raw_files, config, versions),
                             findings, coverage)
    timings["total"] = time.monotonic() - t0

    meta = {**review.metadata, "period": review.manifest.get("period", ""),
            "draft": review.manifest.get("draft", ""),
            "review_id": review.manifest.get("review_id", "")}

    out = outputs_dir(review.folder)
    write_json(out, "findings.json", findings)
    write_json(out, "findings_app.json", _app_shape(findings, meta, coverage, verdict))
    write_json(out, "coverage_manifest.json", coverage)
    write_text(out, "ledger.json", serialize_ledger(ledger))
    write_json(out, "telemetry.json", {"timings_seconds": {k: round(v, 4) for k, v in timings.items()},
                                       "finding_count": len(findings),
                                       "suppressed_count": suppressed_count})
    write_json(out, "skeptic_decisions.json", skeptic_log)
    write_json(out, "reconciler_decisions.json", reconciler_log)
    write_json(out, "rejected_findings.json", rejected)
    write_text(out, "dashboard.html",
               render_dashboard(findings, meta, verdict, coverage, framework,
                                config, ledger["run_id"]))
    write_bytes(out, "preparer_export.pdf",
                render_export(findings, meta, verdict, framework, config, "preparer"))
    write_bytes(out, "audit_file_export.pdf",
                render_export(findings, meta, verdict, framework, config, "audit"))

    return {"findings": findings, "coverage": coverage, "verdict": verdict,
            "ledger": ledger, "rejected": rejected, "skeptic_log": skeptic_log,
            "reconciler_log": reconciler_log, "outputs_dir": str(out)}


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: python3 run_review.py <review_folder> [--config path]")
        return 2
    config = None
    if "--config" in argv:
        config = load_config(argv[argv.index("--config") + 1])
    result = run(argv[1], config)
    v = result["verdict"]
    print(f"SHINE v9 run {result['ledger']['run_id']}: {len(result['findings'])} findings, "
          f"{v['state']} ({v['driver']})")
    print(f"outputs: {result['outputs_dir']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
