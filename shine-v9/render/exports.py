"""Dual export: preparer and audit file. Statement-grouped, FS page order.

Filter rules (v8 invariants carried forward):
  preparer    state OPEN or ACCEPTED, suppressed excluded. The action list the
              administrator works from.
  audit file  every state except DISCARDED, suppressed included with a marker,
              skeptic and reconciler provenance shown. The file that answers
              "how was this draft reviewed".
Both exclude DISCARDED. Both carry the attribution footer on every page.
"""
from __future__ import annotations

from render.pdf_writer import PdfBuilder


def sanitize(text) -> str:
    """No em dashes in any generated artifact (engine-wide rule)."""
    return str(text).replace("—", ":").replace("–", "-")


def _grouped(findings: list[dict], framework) -> list[tuple[str, list[dict]]]:
    order = [framework.statement_name(k) for k in
             framework.fs_page_order + ["notes", "tie_out"]]
    order.append("Cover")
    groups: dict[str, list] = {}
    for f in findings:
        groups.setdefault(f["statement"], []).append(f)
    keys = sorted(groups.keys(), key=lambda s: order.index(s) if s in order else 99)
    return [(k, sorted(groups[k], key=lambda f: (f["sort_order"], f["id"]))) for k in keys]


def _header(pdf: PdfBuilder, meta: dict, verdict: dict, mode_label: str):
    pdf.add(sanitize(meta.get("legal_name", "")), bold=True, size=15)
    pdf.add(sanitize(f"{meta.get('period', '')} · {mode_label} · SHINE v9.0"), size=9)
    pdf.add(sanitize(f"Readiness: {verdict['state']} ({verdict['driver']})"), bold=True, size=10)
    pdf.add_rule()


def _finding_block(pdf: PdfBuilder, f: dict, *, audit: bool):
    sev = f"{f['id']}  {f['severity']}/{f['confidence_label']}  {f['state']}"
    if f.get("suppressed"):
        sev += "  [SUPPRESSED: clearly trivial]"
    pdf.add(sanitize(sev), bold=True, size=9)
    loc = " · ".join(x for x in [f["section"], f["location"].get("line_id"),
                                 f["location"].get("note_id") and f"Note {f['location']['note_id']}"] if x)
    pdf.add(sanitize(loc), size=8, indent=10)
    pdf.add(sanitize(f["message"]), size=9, indent=10)
    ev = f.get("evidence") or {}
    if ev.get("citation_key"):
        verified = "verified" if ev.get("citation_verified") else "UNVERIFIED"
        pdf.add(sanitize(f"Citation: {ev['citation_key']} ({verified}, {ev.get('citation_source', '')})"),
                size=8, indent=10)
    if ev.get("relationship"):
        pdf.add(sanitize(f"Relationship {ev['relationship']}: stated {ev.get('lhs')} vs computed {ev.get('rhs')}, delta {ev.get('delta')}"),
                size=8, indent=10)
    pdf.add(sanitize(f"Fix: {f['fix']}"), size=9, indent=10)
    if audit:
        sk = f.get("skeptic")
        if sk:
            pdf.add(sanitize(f"Skeptic: {sk['outcome']}: {sk['rationale']}"), size=8, indent=10)
        rec = f.get("reconciler")
        if rec:
            pdf.add(sanitize(f"Reconciler: {rec['pattern']} (score {rec['score']}), "
                             f"{len(rec['constituents'])} constituents preserved:"), size=8, indent=10)
            for c in rec["constituents"]:
                pdf.add(sanitize(f"- [{c['source']}] {c['message'][:120]}"), size=8, indent=20)
    pdf.add()


def render_export(findings: list[dict], meta: dict, verdict: dict, framework,
                  config: dict, mode: str) -> bytes:
    footer = sanitize(config.get("attribution_footer", "SHINE v9.0"))
    if mode == "preparer":
        selected = [f for f in findings
                    if f["state"] in ("OPEN", "ACCEPTED") and not f.get("suppressed")]
        label = "Preparer Export"
    else:
        selected = [f for f in findings if f["state"] != "DISCARDED"]
        label = "Audit File Export"

    pdf = PdfBuilder(footer_left=footer)
    _header(pdf, meta, verdict, label)
    if not selected:
        pdf.add("No findings in scope for this export.", size=10)
    for statement, group in _grouped(selected, framework):
        pdf.add(sanitize(f"{statement}  ({len(group)} finding{'s' if len(group) != 1 else ''})"),
                bold=True, size=11)
        pdf.add_rule()
        for f in group:
            _finding_block(pdf, f, audit=(mode == "audit"))
    return pdf.build()
