# PDF Export — v8.1 (3-tier fallback)

**Version:** 8.1.0
**Consumed by:** dashboard at Stage 9 (on-demand export)

Two export modes, three fallback tiers. Both modes follow the v7 absolute rule: **statement-grouped, FS page order, gold-tinted statement headers, NEVER severity-sorted.**

---

## Modes

### Preparer Export
- **Audience:** fund administrator / preparer who will revise the FS.
- **Filter:** state ∈ {OPEN, ACCEPTED}. EXCLUDES DISCARDED and EXCLUDES RESOLVED (resolved is yesterday's news for the preparer).
- **Active text:** uses `controllerEdited` when set, else `voiceNormalized` when set, else `subagentRaw`.
- **Filename:** `<fund-code>-<period>-shine-preparer-export-<build-date>.pdf`
- **Header:** simplified readiness summary (one line) + the CFO summary's "Findings" line.
- **Sorting:** statement groups in `fs_page_order`; within group by `sortOrder`.
- **Reconciler attribution:** root cause finding shown; constituents NOT enumerated (preparer doesn't need the audit trail).
- **Evergreen findings:** EXCLUDED (these are controller-accepted; no preparer action needed).

### Audit File Export
- **Audience:** audit file / Deloitte review.
- **Filter:** state ∈ {ACCEPTED, RESOLVED}. EXCLUDES OPEN (not yet dispositioned) and EXCLUDES DISCARDED (definitionally not relevant).
- **Active text:** uses the same priority but with provenance chain visible (raw / polished / edited shown as a small triplet on each card).
- **Filename:** `<fund-code>-<period>-shine-audit-file-export-<build-date>.pdf`
- **Header:** full readiness banner + full CFO summary.
- **Sorting:** statement groups in `fs_page_order`; within group by `sortOrder`.
- **Reconciler attribution:** root cause + full constituent list with original subagent attribution (the audit trail).
- **Evergreen findings:** INCLUDED in a dedicated "Evergreen-accepted" section at the end with acceptance reason and date for each.
- **Synthetic-resolved:** INCLUDED (priors that cleared in the current period — auditor cares).
- **Discard log:** INCLUDED as an appendix (review-level discard rate + per-finding attestations when present).

Both modes carry the attribution footer (invariant rule 19) on every page.

---

## Three-tier fallback (invariant rule 10)

### Tier 1 — jsPDF (preferred)
- Use `jsPDF` (embedded inline as base64 in `dashboard.html`).
- Pros: pixel-perfect layout, controllable page breaks, gold-tinted statement headers, embedded fonts.
- Procedure:
  1. Open the PDF document.
  2. Render the header block (or simplified header for Preparer).
  3. For each statement group in `fs_page_order`:
     - Insert a gold-tinted header row spanning the page width.
     - For each finding card in `sortOrder` order: render the card.
     - Force a soft page break only if the next card would split awkwardly across pages.
  4. Render the attribution footer on every page.
  5. Save with the filename above.
- Failure detection: catch jsPDF exceptions (font issues, OOM on large finding sets). Falls through to Tier 2.

### Tier 2 — Print popup (browser native)
- Open a new window with print-optimized CSS, then `window.print()`.
- Pros: no library dependency, browser handles fonts and rendering.
- Cons: user must select "Save as PDF" from the print dialog; pagination is at the mercy of the browser.
- Procedure:
  1. Build a print-only HTML document with the filtered finding set.
  2. Apply `@media print` styles preserving statement-group structure and gold-tinted headers.
  3. Apply `@page { size: letter; margin: 0.75in 0.5in 1in 0.5in; }` (last margin reserves footer space).
  4. Apply `@page { @bottom-center { content: "Architecture: Ashitosh Shinde · Apollo Mumbai Controllership · SHINE v8.1 · " counter(page); } }` for the attribution footer.
  5. Trigger `window.print()`.
- Failure detection: popup blocker (window === null after window.open). Falls through to Tier 3.

### Tier 3 — Blob download (always works)
- Build a static HTML file and trigger a download via Blob.
- The user opens it in a browser and prints to PDF themselves.
- Pros: never fails.
- Cons: extra step for the user; not a real PDF.
- Procedure:
  1. Build the same HTML document as Tier 2.
  2. `new Blob([html], { type: "text/html" })`.
  3. `URL.createObjectURL(blob)`.
  4. Create an `<a download="...">` link and click it programmatically.
- The user is shown a banner: "Your browser blocked the PDF export. The review has been saved as an HTML file — open it and print to PDF (Ctrl+P → Save as PDF)."

---

## Statement-header rendering (jsPDF spec)

Gold-tinted section divider row:
- Full page width.
- Background fill: `#FFF8E1` (gold tint).
- Top + bottom border: `#D4AF37` (gold), 0.5pt.
- Font: bold, 12pt.
- Content: `{label}  ·  {count} findings  ·  {severity badges}`  where:
  - `label` from `manifests/statement-groups.json`
  - `count` from filtered finding set within this group
  - `severity badges` are small inline color-coded pills: `[5 C] [3 H] [2 M] [1 L]` where letters are CRITICAL/HIGH/MEDIUM/LOW counts.

Below the gold row, an italic line shows the section note (also from `statement-groups.json`).

---

## Finding card rendering (jsPDF spec)

Each card is approximately ~3 inches tall (variable based on text length). Layout:

```
┌────────────────────────────────────────────────────────────────────────┐
│ F-014    [HIGH] [PROBABLE]   OPEN     RECURRING       narrative · L3   │
│ Notes to Financial Statements · Fair value measurements · p. 17 · N4(b)│
│                                                                         │
│ <Active finding text — one or two paragraphs>                          │
│                                                                         │
│ ▸ Evidence (when present): quoted text excerpt                          │
│ ▸ Citation: ASC 820-10-50-2(c)   (L9)   |   CIMA:PFA   (L12)            │
│                                                                         │
│ Fix:                                                                    │
│ <Active fix text>                                                       │
│                                                                         │
│ [Reconciler: Pattern 01 — ASU Adoption Cluster  ·  3 constituents]      │
│   F-019, F-031, F-042 (Audit File Export only — full provenance chain) │
└────────────────────────────────────────────────────────────────────────┘
```

- Severity chip colors match the dashboard color convention.
- State chip is text-only on white background.
- Recurrence chip is small text-only.
- For Audit File Export, the constituent list shows IDs with original subagent attribution.
- For Preparer Export, the reconciler attribution line shows the pattern name only.

---

## Filenames

```
<fund-code>-<period>-shine-preparer-export-<YYYYMMDD>.pdf
<fund-code>-<period>-shine-audit-file-export-<YYYYMMDD>.pdf
```

Where:
- `fund-code` is from `_FUND-METADATA.json`.
- `period` is the period from the review brief in compact form (e.g., `FY2025`, `Q3-2025`).
- `<YYYYMMDD>` is the build date.

---

## Validation

The orchestrator MUST validate before the export is finalized:
- Statement group order matches `fs_page_order`.
- DISCARDED findings are NOT in the export.
- For Preparer: RESOLVED findings are NOT in the export, evergreen findings are NOT in the export.
- For Audit File: OPEN findings are NOT in the export; evergreen section is present; synthetic-resolved section is present.
- Attribution footer text exact-string-matches: `Architecture: Ashitosh Shinde · Apollo Mumbai Controllership · SHINE v8.1`.
- All UTF-8 characters render directly (no unicode escape leakage).

If any validation fails, the orchestrator returns to the controller with an error and does NOT save the file.
