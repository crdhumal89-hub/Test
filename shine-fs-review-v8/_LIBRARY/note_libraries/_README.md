# _LIBRARY/note_libraries/

This directory holds disclosure libraries consumed by the Narrative subagent for L3 (disclosure completeness).

## Default library

`disclosure-inventory-v1.md` — the Apollo Controllership default inventory of expected disclosures by topic (significant accounting policies, fair value measurements, investments, management fees and carried interest, related party transactions, commitments and contingencies, income taxes, financial highlights, subsequent events, recently issued accounting standards). Drop the file here when ready.

## Fund-specific additions

Funds with bespoke disclosure conventions (e.g., side-pocket narratives, rated-note-feeder structures) can drop a `<fund-code>-additions-vN.md` here. Narrative reads both the default and the additions; the additions augment rather than replace the default.

## Format

Disclosure libraries are markdown documents listing, per topic:
- Required disclosures (with ASC paragraph cross-references where applicable)
- Boilerplate-vs-substantive guidance (what the disclosure should achieve)
- Common omissions

## Cadence

Reviewed at least annually by the Steward; updated as new ASUs are adopted, new fund structures emerge, or audit feedback reveals gaps.
