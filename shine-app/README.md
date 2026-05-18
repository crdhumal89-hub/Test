# SHINE App

Controller-facing review interface for SHINE v8.1 — Statement Health Intelligence & Notation Engine.

Pure client-side. No build step. Open `index.html` directly, or run a static server:

```
npm start          # serves at http://localhost:3000
```

## Files

- `index.html` — entry point (single page)
- `styles.css` — minimalist monochrome theme + severity color
- `app.js` — state, rendering, disposition cycle, PDF export
- `sample-data.js` — embedded demo review (16 realistic findings)

## Features

- Reviews list → dashboard → coverage → settings
- Statement-grouped findings (v7 default) · By-severity · By-layer toggle
- Structured CFO summary, readiness banner, degradation chips
- Disposition cycle: Accept / Resolve / Discard / Reopen / Mark evergreen / Inline edit
- Three-field provenance: subagent raw / polished / controller-edited
- Reconciler constituents with decouple
- Recurring / regressed / evergreen badges
- Discard-rate surveillance (>20% triggers attestation modal)
- Ctrl+Z undo (depth 20)
- 3-tier PDF export (jsPDF → print → Blob) — Preparer and Audit file modes
- localStorage persistence keyed by `review_id`
- Light / dark theme
- Import real `findings.json` (top-right import icon)

## Real reviews

Replace `sample-data.js` or use the import icon (top-right) with a `findings.json` of shape:

```json
{
  "brief": { "review_id": "...", "fund_legal_name": "...", "...": "..." },
  "coverage": { "...": "..." },
  "findings": [ { "id": "F-001", "...": "..." } ]
}
```

Schema in `../shine-fs-review-v8/manifests/finding-schema.json`.
