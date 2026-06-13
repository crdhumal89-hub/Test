"""Self-contained dashboard generator.

One HTML file, data embedded, no external dependencies, openable by double
click next to the review folder. Carries the v8 surface contract: statement
grouping in FS page order, severity-and-coverage readiness banner, loaded CFO
summary, chips, constituents toggle, disposition controls with an undo stack,
attribution footer. All generated text passes the em-dash sanitizer.
"""
from __future__ import annotations

import json

from render.exports import sanitize


def _esc(s) -> str:
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def render_dashboard(findings: list[dict], meta: dict, verdict: dict, coverage: dict,
                     framework, config: dict, run_id: str) -> str:
    order = [framework.statement_name(k) for k in framework.fs_page_order + ["notes", "tie_out"]]
    order.insert(0, "Cover")

    def sort_key(f):
        s = f["statement"]
        return (order.index(s) if s in order else 99, f["sort_order"], f["id"])

    ordered = sorted(findings, key=sort_key)
    payload = json.dumps(ordered, sort_keys=True).replace("</", "<\\/")

    counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    suppressed = 0
    for f in findings:
        counts[f["severity"]] += 1
        suppressed += 1 if f.get("suppressed") else 0
    completeness = coverage.get("completeness_pct", 1.0)
    banner_class = {"READY": "ready", "READY_WITH_EXCEPTIONS": "exceptions",
                    "NOT_READY": "notready"}[verdict["state"]]
    banner_label = verdict["state"].replace("_", " ")

    cfo_lines = [
        ("ENTITY", f"{meta.get('legal_name', '')} · {meta.get('domicile', '')} · {meta.get('period', '')}"),
        ("FRAMEWORK", f"{framework.code} · adapter {config.get('adapter')} · model pin {config.get('model_pin')}"),
        ("FINDINGS", f"{len(findings)} total · {counts['CRITICAL']} critical · {counts['HIGH']} high · "
                     f"{counts['MEDIUM']} medium · {counts['LOW']} low · {suppressed} suppressed as trivial"),
        ("COVERAGE", f"{completeness:.0%} of applicable checks accounted for · "
                     f"{coverage.get('checked_count', 0)} checked · {coverage.get('skipped_count', 0)} skipped with reason"),
        ("RUN", f"run {run_id} · reproducible ledger committed alongside this dashboard"),
    ]
    cfo_html = "".join(
        f'<div class="cfo-row"><span class="cfo-k">{_esc(k)}</span><span>{_esc(sanitize(v))}</span></div>'
        for k, v in cfo_lines)

    chips = []
    if suppressed:
        chips.append(f"{suppressed} suppressed as clearly trivial")
    sk_dropped = sum(1 for f in findings if (f.get("skeptic") or {}).get("outcome") == "demoted")
    if sk_dropped:
        chips.append(f"{sk_dropped} demoted by the skeptic")
    rec_roots = sum(1 for f in findings if f.get("reconciler"))
    if rec_roots:
        chips.append(f"{rec_roots} reconciler root cause{'s' if rec_roots != 1 else ''}")
    chips_html = "".join(f'<span class="chip">{_esc(sanitize(c))}</span>' for c in chips)

    footer = sanitize(config.get("attribution_footer", "SHINE v9.0")) + f" · run {run_id}"

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SHINE v9 · {_esc(sanitize(meta.get('legal_name', '')))}</title>
<style>
:root {{ --ink:#1a202c; --navy:#1a2b4a; --gold:#b8902e; --gray:#6e7480; --hair:#d6d6d0;
  --panel:#f7f7f4; --crit:#c0392b; --high:#c96e08; --med:#a88a00; --low:#6b7280; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; font:14px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
  color:var(--ink); background:#fbfaf6; }}
.wrap {{ max-width:1080px; margin:0 auto; padding:24px; }}
.banner {{ padding:14px 18px; border-radius:6px; font-weight:700; margin-bottom:14px; }}
.banner.ready {{ background:#dcfce7; color:#166534; }}
.banner.exceptions {{ background:#fef3c7; color:#92400e; }}
.banner.notready {{ background:#fee2e2; color:#991b1b; }}
.banner small {{ display:block; font-weight:400; margin-top:4px; }}
.cfo {{ background:#fff; border:1px solid var(--hair); border-radius:6px; padding:14px 18px; margin-bottom:14px; }}
.cfo-row {{ display:grid; grid-template-columns:110px 1fr; gap:12px; padding:4px 0;
  border-bottom:1px dashed var(--hair); font-size:13px; }}
.cfo-row:last-child {{ border-bottom:0; }}
.cfo-k {{ font-size:10px; font-weight:700; letter-spacing:1.2px; color:var(--gray); padding-top:2px; }}
.chips {{ margin-bottom:14px; }}
.chip {{ display:inline-block; background:var(--panel); border:1px solid var(--hair);
  border-radius:999px; padding:3px 10px; font-size:11px; margin-right:6px; color:var(--gray); }}
.group-h {{ background:#fff8e1; border:1px solid var(--gold); border-radius:5px;
  padding:8px 14px; font-weight:700; margin:18px 0 8px; }}
.f {{ background:#fff; border:1px solid var(--hair); border-radius:6px; padding:12px 16px; margin-bottom:8px; }}
.f.suppressed {{ opacity:.45; }}
.f.DISCARDED {{ opacity:.35; }}
.fhead {{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:6px; }}
.fid {{ font:11px ui-monospace,Menlo,monospace; color:var(--gray); font-weight:700; }}
.sev {{ font-size:10px; font-weight:700; padding:2px 8px; border-radius:3px; }}
.sev.CRITICAL {{ background:#fdedec; color:var(--crit); }} .sev.HIGH {{ background:#fef3e0; color:var(--high); }}
.sev.MEDIUM {{ background:#fcf6d8; color:var(--med); }} .sev.LOW {{ background:#f0f0ee; color:var(--low); }}
.state {{ font-size:10px; color:var(--gray); border:1px solid var(--hair); border-radius:3px; padding:1px 7px; }}
.src {{ margin-left:auto; font:10px ui-monospace,Menlo,monospace; color:#9a9ea6; }}
.loc {{ font-size:12px; color:var(--navy); font-weight:600; margin-bottom:6px; }}
.msg {{ margin-bottom:8px; }}
.cite {{ font:11px ui-monospace,Menlo,monospace; background:var(--panel); padding:1px 7px;
  border-radius:3px; margin-right:6px; }}
.fix {{ background:var(--panel); border-left:3px solid var(--navy); padding:8px 12px;
  border-radius:3px; font-size:13px; margin-bottom:8px; }}
.recon {{ font-size:12px; color:var(--gray); cursor:pointer; user-select:none; }}
.recon-body {{ display:none; border-left:3px solid var(--gold); margin-top:6px; padding:6px 12px; font-size:12px; }}
.recon.open + .recon-body {{ display:block; }}
.actions button {{ font-size:12px; border:1px solid var(--hair); background:none;
  border-radius:4px; padding:3px 12px; margin-right:6px; cursor:pointer; }}
.actions button:hover {{ background:var(--panel); }}
.skeptic {{ font-size:11px; color:var(--gray); font-style:italic; margin-bottom:6px; }}
footer {{ margin-top:28px; padding-top:12px; border-top:1px solid var(--hair);
  font:11px ui-monospace,Menlo,monospace; color:#9a9ea6; text-align:center; }}
</style></head><body><div class="wrap">
<div class="banner {banner_class}">{_esc(banner_label)}<small>{_esc(sanitize(verdict['driver']))}</small></div>
<div class="cfo">{cfo_html}</div>
<div class="chips">{chips_html}</div>
<div id="findings"></div>
<footer>{_esc(footer)}</footer>
</div>
<script>
var DATA = {payload};
var STORE_KEY = "shine-v9:" + {json.dumps(run_id)};
var undoStack = [];
function loadStates() {{
  try {{ return JSON.parse(localStorage.getItem(STORE_KEY) || "{{}}"); }} catch (e) {{ return {{}}; }}
}}
function saveStates(s) {{ try {{ localStorage.setItem(STORE_KEY, JSON.stringify(s)); }} catch (e) {{}} }}
function setState(id, state) {{
  var states = loadStates();
  undoStack.push({{id: id, prev: states[id] || null}});
  if (undoStack.length > 20) undoStack.shift();
  states[id] = state;
  saveStates(states);
  render();
}}
document.addEventListener("keydown", function (e) {{
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {{
    var last = undoStack.pop();
    if (!last) return;
    var states = loadStates();
    if (last.prev === null) delete states[last.id]; else states[last.id] = last.prev;
    saveStates(states); render(); e.preventDefault();
  }}
}});
function esc(s) {{
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}}
function render() {{
  var states = loadStates();
  var groups = {{}}, orderSeen = [];
  DATA.forEach(function (f) {{
    if (!groups[f.statement]) {{ groups[f.statement] = []; orderSeen.push(f.statement); }}
    groups[f.statement].push(f);
  }});
  var html = "";
  if (DATA.length === 0) {{
    html = '<div class="f"><div class="msg">No findings. The draft cleared every applicable check.</div></div>';
  }}
  orderSeen.forEach(function (stmt) {{
    var fs = groups[stmt];
    html += '<div class="group-h">' + esc(stmt) + ' (' + fs.length + ')</div>';
    fs.forEach(function (f) {{
      var state = states[f.id] || f.state;
      var cls = "f " + state + (f.suppressed ? " suppressed" : "");
      html += '<div class="' + cls + '">';
      html += '<div class="fhead"><span class="fid">' + esc(f.id) + '</span>'
        + '<span class="sev ' + esc(f.severity) + '">' + esc(f.severity) + '</span>'
        + '<span class="state">' + esc(f.confidence_label) + '</span>'
        + '<span class="state">' + esc(state) + '</span>'
        + '<span class="src">' + esc(f.source) + '</span></div>';
      html += '<div class="loc">' + esc(f.section)
        + (f.location.line_id ? " · " + esc(f.location.line_id) : "")
        + (f.location.note_id ? " · Note " + esc(f.location.note_id) : "") + '</div>';
      html += '<div class="msg">' + esc(f.message) + '</div>';
      var ev = f.evidence || {{}};
      if (ev.citation_key) {{
        html += '<div style="margin-bottom:8px"><span class="cite">' + esc(ev.citation_key)
          + (ev.citation_verified ? " · verified" : "") + '</span></div>';
      }}
      if (f.skeptic) {{
        html += '<div class="skeptic">Skeptic: ' + esc(f.skeptic.outcome) + ': '
          + esc(f.skeptic.rationale) + '</div>';
      }}
      html += '<div class="fix">' + esc(f.fix) + '</div>';
      if (f.reconciler) {{
        html += '<div class="recon" onclick="this.classList.toggle(\\'open\\')">Reconciler · '
          + esc(f.reconciler.pattern) + ' · ' + f.reconciler.constituents.length
          + ' constituents (click to show)</div><div class="recon-body">';
        f.reconciler.constituents.forEach(function (c) {{
          html += '<div>[' + esc(c.source) + '] ' + esc(c.message) + '</div>';
        }});
        html += '</div>';
      }}
      html += '<div class="actions">'
        + '<button onclick="setState(\\'' + f.id + '\\', \\'ACCEPTED\\')">Accept</button>'
        + '<button onclick="setState(\\'' + f.id + '\\', \\'RESOLVED\\')">Resolve</button>'
        + '<button onclick="setState(\\'' + f.id + '\\', \\'DISCARDED\\')">Discard</button>'
        + '<button onclick="setState(\\'' + f.id + '\\', \\'OPEN\\')">Reopen</button>'
        + '</div></div>';
    }});
  }});
  document.getElementById("findings").innerHTML = html;
}}
render();
</script></body></html>
"""
