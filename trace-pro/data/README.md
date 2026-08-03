# Fixtures

Extracted from `reference/TRACE-Pro-original.html` by `scripts/extract-fixtures.mjs`.
Re-verify with `npm run fixtures:check` — it asserts deep equality against the original, so
these files cannot drift from the artifact they came from.

| File | Was | Contents |
|---|---|---|
| `lookthrough.json` | `EMB` | 149 look-through tree nodes, product headline |
| `universe.json` | `UNI` | firm-wide ownership graph: 1,382 edges, 710 entities, 2,500 search rows, 1,986 ultimates, 5 issue buckets |
| `repricing.json` | `REVBASE` | 26 funds with NAV / revised / derived / global-units maps, 3 apex, 6 breaks |
| `simulator.json` | `SIM` | 26 funds, 33 edges, 27 tree nodes, 14 breaks |
| `legacy-pricing.json` | `PRICING` | legacy recon model; supplies warnBps/badBps/product/ltvByCode only |

## Fields nothing reads

Copied faithfully anyway, because they are data of record (see `docs/redesign-spec.md` Q2):
`EMB.recon` (23 rows), `EMB.dcN`, `EMB.resid`, `EMB.bps`, `EMB.apexPos`, `EMB.grandVar`,
`PRICING.lookthroughNAV`, `.derivedTotal`, `.positionTotal`, `.repricingPnL`,
`.priceableCount`, `.missingNav`, `.fxFunds`, `PRICING.recon.grossNonTrade`, `.grossLT`,
`.net`, `.apexNAV`, `.productName`, `UNI.counts`, `REVBASE.maxlevel`, `SIM.maxlevel`.

## Two product NAVs

`lookthrough.json`.`prodNAV` = 2062196050.07 (fund-entity NAV stamp) and
`repricing.json`.`N` = 2062198835.86 (Σ apex ENDING_NAV) differ by 2785.79, which is exactly the
DUNK feeder's NAV. Both are preserved and both are displayed, labelled by basis. See spec §1.8.1.
