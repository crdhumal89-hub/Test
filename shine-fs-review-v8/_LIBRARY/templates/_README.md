# _LIBRARY/templates/

This directory holds statement and note templates consumed by the Mechanical subagent for L4 (template & policy compliance).

## Default template

`asc-946-lp-default-v1.md` — the Apollo Controllership default ASC 946 limited-partnership template, covering caption conventions, note ordering, and per-class breakout structure. Drop the file here when ready.

## Fund-specific overrides

Funds with bespoke presentation conventions can drop a `<fund-code>-template-vN.md` here. The orchestrator passes only the relevant template files to Mechanical per the manifest.

## Format

Templates are markdown documents describing:
- Statement-by-statement caption inventory
- Note ordering
- Per-class breakout structure
- Required and prohibited captions

## Cadence

Templates are reviewed annually by the Steward and updated as ASUs are adopted or fund structures evolve.
