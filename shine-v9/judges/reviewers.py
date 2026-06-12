"""The five v9 reviewers, ported and upgraded from the v8 subagent personas.

presentation  v8 Mechanical's non-arithmetic remit: required statements,
              entity verification, template conformity.
disclosure    v8 Narrative: disclosure adequacy, placeholder and ghost text.
standards     v8 Standards: framework checklist with mandatory citations.
comparative   v8 Comparative: period-over-period and inter-entity reasoning.
regulatory    v8 Defense: jurisdiction-driven regulatory exposure.

Each reviewer returns (findings, coverage). Coverage declares every check run
and every skip with a reason code. All rule logic here is deterministic; the
adapter boundary decides whether a model augments it in production.
"""
from __future__ import annotations

import re
from decimal import Decimal

from core.numbers import D, f, get_path
from frameworks.regulatory_reqs import build_regulatory_checklist
from judges.common import (checklist_walk, find_note, make_finding,
                           scan_all_notes_for)

PLACEHOLDER_PATTERNS = [
    (r"\[TBD\]|\bTBD\b", "a TBD marker"),
    (r"\[INSERT[^\]]*\]|\[insert[^\]]*\]", "an insert placeholder"),
    (r"\bXXX+\b", "an XXX placeholder"),
    (r"lorem ipsum", "boilerplate filler text"),
    (r"\b20XX\b", "an unresolved year placeholder"),
]


def review_presentation(ctx: dict):
    figures, metadata, framework = ctx["figures"], ctx["metadata"], ctx["framework"]
    versions = ctx["versions"]
    findings, checked, skipped = [], [], []

    # Entity verification (the v8 Stage 2 analogue). Qualitative materiality:
    # identity mismatches are CRITICAL regardless of dollar impact.
    checked.append("ENTITY_LEGAL_NAME")
    fig_name = get_path(figures, "entity.legal_name")
    meta_name = metadata.get("legal_name")
    if fig_name and meta_name and fig_name != meta_name:
        findings.append(make_finding(
            source="presentation", category="entity_mismatch", severity="CRITICAL",
            confidence_label="CERTAIN", statement="Cover", section="Entity identity",
            sort_order=1,
            message=f"The statements carry the entity name {fig_name!r} but fund metadata records {meta_name!r}. Identity mismatches are critical regardless of dollar impact.",
            fix="Determine the source of truth and correct the cover or the metadata before any other review step.",
            framework_code=framework.code, versions=versions,
            line_id="Legal name", legacy_layer="L1"))

    checked.append("ENTITY_PERIOD")
    fig_period = get_path(figures, "entity.period")
    manifest_period = (ctx.get("manifest") or {}).get("period")
    if fig_period and manifest_period and fig_period != manifest_period:
        findings.append(make_finding(
            source="presentation", category="entity_mismatch", severity="CRITICAL",
            confidence_label="CERTAIN", statement="Cover", section="Entity identity",
            sort_order=2,
            message=f"The statements are labeled {fig_period!r} but the review manifest expects {manifest_period!r}.",
            fix="Confirm the period under review and correct the statements or the manifest.",
            framework_code=framework.code, versions=versions,
            line_id="Period", legacy_layer="L1"))

    # Required statements per framework.
    presence = {
        "balance_sheet": bool(figures.get("balance_sheet")),
        "soo": bool(figures.get("statement_of_operations")),
        "soc": bool(figures.get("statement_of_changes")),
        "soi": bool((figures.get("schedule_of_investments") or {}).get("positions")),
        "highlights": bool(figures.get("financial_highlights")),
        "scf": bool((figures.get("cash_flows") or {}).get("present", False)),
    }
    for req in framework.required_statements(figures):
        key = req["canonical_key"]
        check_id = f"REQUIRED_STATEMENT_{key.upper()}"
        if not req["required"]:
            skipped.append({"check": check_id, "reason_code": "NOT_APPLICABLE",
                            "reason": req["reason"]})
            continue
        checked.append(check_id)
        if not presence.get(key, False):
            display = framework.statement_name(key)
            findings.append(make_finding(
                source="presentation", category="presentation_gap", severity="CRITICAL",
                confidence_label="CERTAIN", statement=display, section="Statement presence",
                sort_order=5,
                message=f"The {display} is not presented. It is a required statement: {req['reason']}.",
                fix=f"Present the {display} as part of the complete set of financial statements.",
                framework_code=framework.code, versions=versions,
                citation_key=req.get("citation_key"), legacy_layer="L4"))
    return findings, {"checked": checked, "skipped": skipped}


def review_disclosure(ctx: dict):
    notes, framework, versions = ctx["notes"], ctx["framework"], ctx["versions"]
    items = framework.checklist(ctx["figures"], ctx["metadata"])
    findings, coverage = checklist_walk(items, notes, framework, versions,
                                        kinds=("disclosure",), source="disclosure",
                                        legacy_layer="L3")
    # Placeholder and ghost text scan over every note (the v8 L7 forensic remit).
    coverage["checked"].append("PLACEHOLDER_SCAN")
    notes_stmt = framework.statement_name("notes")
    for note in notes.get("notes", []):
        for pattern, label in PLACEHOLDER_PATTERNS:
            m = re.search(pattern, note.get("text", ""))
            if m:
                findings.append(make_finding(
                    source="disclosure", category="placeholder_text", severity="CRITICAL",
                    confidence_label="CERTAIN", statement=notes_stmt,
                    section=note.get("title", "Notes"), sort_order=80,
                    message=f"Note {note.get('id')} ({note.get('title')}) contains {label}: {m.group(0)!r}. Unresolved placeholders are critical in any draft bound for an external reader.",
                    fix="Resolve the placeholder before the draft moves forward.",
                    framework_code=framework.code, versions=versions,
                    note_id=note.get("id"), quoted_text=m.group(0), legacy_layer="L7"))
    return findings, coverage


def review_standards(ctx: dict):
    notes, framework, versions = ctx["notes"], ctx["framework"], ctx["versions"]
    items = framework.checklist(ctx["figures"], ctx["metadata"])
    return checklist_walk(items, notes, framework, versions,
                          kinds=("standards",), source="standards",
                          legacy_layer="L9")


def review_comparative(ctx: dict):
    figures, framework, versions = ctx["figures"], ctx["framework"], ctx["versions"]
    notes, metadata = ctx["notes"], ctx["metadata"]
    tolerances = ctx["config"]["tolerances"]
    findings, checked, skipped = [], [], []

    # Period over period: material unexplained movements.
    prior = ctx.get("prior_figures")
    watch_paths = [
        ("balance_sheet.assets.investments_at_fair_value", "Investments at fair value", "balance_sheet"),
        ("balance_sheet.partners_capital", "Partners capital", "balance_sheet"),
        ("statement_of_operations.expenses.total", "Total expenses", "soo"),
        ("statement_of_operations.net_increase_in_partners_capital", "Net increase from operations", "soo"),
    ]
    if prior:
        capital = D(get_path(figures, "balance_sheet.partners_capital")) or Decimal(0)
        planning_pct = D(metadata.get("materiality", {}).get("planning_pct_of_nav")
                         or ctx["config"]["materiality"]["default_planning_pct_of_nav"])
        materiality = capital * planning_pct
        for path, label, stmt_key in watch_paths:
            cur, prev = D(get_path(figures, path)), D(get_path(prior, path))
            if cur is None or prev is None:
                skipped.append({"check": f"YOY_{path}", "reason_code": "INPUT_MISSING",
                                "reason": f"{path} absent from current or prior figures"})
                continue
            checked.append(f"YOY_{path}")
            delta = cur - prev
            if abs(delta) >= materiality:
                explained = scan_all_notes_for(
                    notes, [label.split()[0].lower() + r"|" + label.lower(),
                            r"increase|decrease|driven|due to|reflect"])
                if not explained:
                    display = framework.statement_name(stmt_key)
                    findings.append(make_finding(
                        source="comparative", category="comparative_movement",
                        severity="MEDIUM", confidence_label="PROBABLE",
                        statement=display, section=label, sort_order=40,
                        message=f"{label} moved {f(delta):,.0f} year over year ({f(prev):,.0f} to {f(cur):,.0f}), above planning materiality, and no note explains the driver.",
                        fix="Add or extend the narrative explaining the driver of the movement, or confirm the figures.",
                        framework_code=framework.code, versions=versions,
                        line_id=label, path=path,
                        lhs=f(cur), rhs=f(prev), delta=f(delta), legacy_layer="L10"))
    else:
        skipped.append({"check": "YOY_ALL", "reason_code": "INPUT_MISSING",
                        "reason": "prior_figures.json not supplied; period-over-period review skipped"})

    # Inter-entity: feeder investment in master against master capital.
    sibling = ctx.get("sibling_figures")
    linked = [e for e in metadata.get("linked_entities", []) if e.get("relationship") == "feeder"]
    if sibling and linked:
        link = linked[0]
        checked.append("INTER_ENTITY_FEEDER_TIE")
        feeder_inv = D(get_path(sibling, "balance_sheet.assets.investment_in_master"))
        master_capital = D(get_path(figures, "balance_sheet.partners_capital"))
        pct = D(link.get("ownership_pct", 1.0))
        if feeder_inv is not None and master_capital is not None:
            expected = master_capital * pct
            if abs(feeder_inv - expected) > D(tolerances["inter_entity_abs"]):
                findings.append(make_finding(
                    source="comparative", category="inter_entity_break", severity="HIGH",
                    confidence_label="CERTAIN",
                    statement=framework.statement_name("balance_sheet"),
                    section="Inter-entity reconciliation", sort_order=45,
                    message=f"The feeder {link.get('code')} carries its investment in the master at {f(feeder_inv):,.0f} but {f(pct):.0%} of master capital computes to {f(expected):,.0f}: break of {f(feeder_inv - expected):,.0f}.",
                    fix="Reconcile the feeder's carrying value to the master's capital at the feeder's ownership share.",
                    framework_code=framework.code, versions=versions,
                    line_id="Investment in master",
                    lhs=f(feeder_inv), rhs=f(expected), delta=f(feeder_inv - expected),
                    legacy_layer="L11"))
    elif linked:
        skipped.append({"check": "INTER_ENTITY_FEEDER_TIE", "reason_code": "INPUT_MISSING",
                        "reason": "linked feeder declared in metadata but sibling_figures.json not supplied"})
    else:
        skipped.append({"check": "INTER_ENTITY_FEEDER_TIE", "reason_code": "NOT_APPLICABLE",
                        "reason": "no linked feeder entities in metadata"})
    return findings, {"checked": checked, "skipped": skipped}


def review_regulatory(ctx: dict):
    notes, framework, versions = ctx["notes"], ctx["framework"], ctx["versions"]
    items = build_regulatory_checklist(ctx["metadata"])
    return checklist_walk(items, notes, framework, versions,
                          kinds=("standards",), source="regulatory",
                          legacy_layer="L12")


REVIEWERS = [
    ("presentation", review_presentation),
    ("disclosure", review_disclosure),
    ("standards", review_standards),
    ("comparative", review_comparative),
    ("regulatory", review_regulatory),
]
