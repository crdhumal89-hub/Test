# Dashboard Render — v8.1

**Version:** 8.1.0
**Consumed by:** orchestrator Stage 7
**Output:** `outputs/dashboard.html` — a single self-contained HTML file (inline CSS + inline JS) the controller opens in a browser.

This document is the rendering protocol. Follow it precisely. The orchestrator validates the output at the end of Stage 7 with Rule 7 (Node syntax check) and Rule 8 (unicode escape grep) before delivery.

---

## Inputs to the render

1. `outputs/findings.json` — merged, deduped, escalated, voice-annotated finding set.
2. `outputs/coverage-manifest.json` — for degradation chips + coverage completeness.
3. `outputs/reconciler-decisions.log` — for the "Show constituents" reconciler trace.
4. The review brief — for the header (fund identity, period, draft).
5. `manifests/statement-groups.json` — for group labels and section notes.

---

## Page structure (top to bottom)

### 1. Header block

- Fund legal name (large, bold).
- Period and draft revision.
- Domicile, structure type.
- Build date and SHINE version.
- The readiness banner (see §3).

### 2. Structured CFO Summary block (v8.1, replaces v8.0 narrative)

Five lines, each labeled. No fluff.

```
ENTITY               AAA Coinvest A LP · Cayman exempted limited partnership · FY2025 Draft 1.1
MATERIALITY          Planning $X.XM (0.75% NAV) · Clearly trivial $XK (5% of materiality)
FINDINGS             N total · A CRITICAL · B HIGH · C MEDIUM · D LOW  →  E open · F accepted · G resolved · H discarded · I evergreen
COVERAGE             X% applicable · J ASC paragraphs checked / K skipped-with-reason · L11/L12 jurisdictions in scope: CIMA, SEC, IRS
RESIDUAL RISK CLASS  GREEN | AMBER | RED  →  driver: <one phrase>
```

This block is selectable text (not an image) so the controller can copy it into committee minutes.

### 3. Readiness banner

Three states (v8.1 combined rule from `SKILL.md` rule 17):

- **READY (green)** — `coverage_completeness_pct ≥ 0.95` AND no unresolved CRITICAL or HIGH (excluding `EVERGREEN_ACCEPTED`).
- **READY WITH EXCEPTIONS (amber)** — `0.85 ≤ coverage_completeness_pct < 0.95` AND only MEDIUM/LOW residual.
- **NOT READY (red)** — any other state. Reasons enumerated below the banner.

Below the banner: narrative bullets surfacing:
- Coverage % and any layer skipped without reason.
- Controller discard rate (if >0%).
- Synthetic-resolved count.
- Evergreen count.
- Regulatory corpus attestation ages (warn if any > 180 days).

### 4. Degradation chips bar

Horizontal row of small colored chips representing degraded scope:

- Red chip per missing soft-required input ("LPA not supplied", "Workbook not supplied", "Prior FS not supplied").
- Orange chip per subagent timeout or partial coverage.
- Yellow chip per ASC paragraph skipped with reason (aggregate count, hover for list).
- Orange chip if `outputs/rejected-findings.log` has entries ("N findings rejected at schema validation").
- Gold chip per evergreen-accepted finding count.

Each chip has a tooltip with detail and an optional "View log" link.

### 5. Statement-grouped finding list (v7 absolute rule 1)

`groupMode = "statement"` is the default. Statement groups render in `fs_page_order` from `manifests/statement-groups.json`. Each group renders:

- **Group header** with: full label, severity badges (count by impact), total count, italic section note from `statement-groups.json`.
- **Finding cards** within the group, sorted by `sortOrder` ascending.

A "By Severity" toggle in the top right re-groups by impact, but is NOT default.

### 6. Finding card

Each finding card has:

- **Top row:** ID (F-NNN), severity chips (impact + confidence), state chip (OPEN/ACCEPTED/RESOLVED/DISCARDED), recurrence chip (NEW/RECURRING/REGRESSED/EVERGREEN_ACCEPTED), subagent attribution (e.g., "narrative · L3").
- **Statement / section / location.** Reads "Notes to Financial Statements · Fair value measurements · p. 17 · Note 4(b)".
- **Finding text.** Default: `subagentRaw`. When `voiceNormalized` is non-null, show a "polished available" indicator with a click-to-reveal side-by-side comparison. When `controllerEdited` is set, show the edited text with an "(edited)" badge and a hover tooltip preserving the original.
- **Citation (when applicable).** L9 findings show `evidence.asc_reference`. L12 findings show `evidence.regulatory_citation` with a link to the corpus key.
- **Evidence excerpts** (when present). Quoted text from FS, prior text, workbook proof.
- **Fix.** Same three-field provenance rendering as the finding text.
- **Reconciler attribution** (when `reconciler_pattern` is non-null). Shows the pattern name, specificity score, and a "Show constituents" toggle that reveals the constituent finding IDs with original subagent attribution. The toggle also offers "Decouple this constituent" — which logs the decoupling to `outputs/escalation-decisions.log` and restores the constituent as a standalone finding in the next render.
- **Evergreen badge** (when `prior_review_recurrence == "EVERGREEN_ACCEPTED"`). Gold badge with hover tooltip showing acceptance reason and date.
- **Disposition controls.** Accept / Discard / Resolve / Reopen / Edit. Each action pushes to the undo stack (max 20 entries). Ctrl+Z reverts.

### 7. Footer block

- **Discard-rate surveillance.** Show the aggregate discard rate. If > 20%, render a "Discard rate exceeds 20% — please attest each discard" prompt above the footer.
- **Schema rejection chip.** Aggregate count from `outputs/rejected-findings.log`.
- **Attribution footer (Severity-4 / invariant rule 19):**

  > Architecture: Ashitosh Shinde · Apollo Mumbai Controllership · SHINE v8.1 · [build date]

  This footer line MUST survive PDF export. It is not optional.

---

## Color and typography conventions

- Severity colors: CRITICAL = #C0392B (red), HIGH = #E67E22 (orange), MEDIUM = #F1C40F (yellow), LOW = #95A5A6 (gray).
- Statement group headers: gold-tint background (#FFF8E1) so they read as section dividers (echoes PDF export convention).
- Evergreen badges: gold (#D4AF37).
- Confidence labels rendered as smaller pills: CERTAIN solid, PROBABLE outlined, POSSIBLE dotted-outlined.
- Body text: system font stack (avoid declaring a brand font that the controller may not have installed).
- All UTF-8 direct. NEVER use Python double-backslash unicode escapes — invariant rule 12; Stage 7 grep check enforces this.

---

## JavaScript scope

The dashboard is self-contained. All JS is inline. State (disposition, edit text, undo stack) lives in localStorage keyed by review_id. Page reload preserves state until the controller chooses to "Clear state and re-render" (a button in the top-right gear menu).

No external CDN dependencies for the runtime view. jsPDF is loaded inline (base64-embedded) per `dashboard/pdf-export.md` Tier-1.

---

## Validation gates (orchestrator Stage 7)

Before delivery the orchestrator runs:

### Rule 7 — Node syntax check
```
node --check outputs/dashboard.html
```
HTML doesn't parse as JS, so the check actually wraps the inline `<script>` content into a temp file and validates that. Any syntax error → HALT and regenerate.

### Rule 8 — Unicode escape grep
```
grep -P '\\\\u[0-9a-fA-F]{4}' outputs/dashboard.html
```
Any match → HALT and regenerate. Unicode characters must be direct UTF-8 in source (invariant rule 12).

### Render-content checks
- `groupMode = "statement"` is the default on load — verify in the inline JS.
- Statement group order matches `fs_page_order` from manifests.
- Attribution footer text exact-string-matches the form above.
- Every finding card binds to a valid finding in `findings.json` — no orphan cards, no missing findings.

---

## Disposition cycle (Stage 8 — controller-driven)

The dashboard owns the disposition loop. Each finding card's disposition controls produce these state transitions:

| Action | From | To | Side effect |
|---|---|---|---|
| Accept | OPEN | ACCEPTED | Counts toward "controller-accepted" total. |
| Discard | OPEN, ACCEPTED | DISCARDED | If discard rate > 20% on this review, prompt for one-line attestation. Logged. |
| Resolve | OPEN, ACCEPTED | RESOLVED | Counts toward "resolved" for audit-file export. |
| Reopen | RESOLVED, DISCARDED | OPEN | Reverts the prior disposition. |
| Edit | any | (same) | Edits `controllerEdited`. Original preserved. |
| Undo | (most recent action) | (prior state) | Ctrl+Z. Max 20 entries deep. |
| Decouple constituent | inside reconciler root | (split) | Restores constituent as a standalone finding. Logged. |

State is persisted to localStorage on every transition.

---

## Voice annotation display

Per `reference/voice-style-guide.md`, the orchestrator emits `voiceNormalized` ONLY when a polish was warranted. The dashboard renders:

- `voiceNormalized == null`: show `subagentRaw` only. No "polished available" indicator.
- `voiceNormalized != null AND controllerEdited == null`: show `subagentRaw` by default with a "polished available" toggle that opens a side-by-side comparison.
- `controllerEdited != null`: show `controllerEdited` with an "(edited)" badge. Hover preserves the prior version (polished if available, else raw).

The controller chooses the active version that flows to PDF export via a per-finding radio (Raw / Polished / Edited). Per-finding default is Polished if available; otherwise Raw.

---

## Build date stamping

The footer build date is the orchestrator's run date in ISO format (`YYYY-MM-DD`). The orchestrator MUST stamp this at render time, not at any earlier stage.
