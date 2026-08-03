# parity-map.json — schema

Frozen after the Phase 1 gate. Each key is a **semantic** name for a figure the original displays.
Selectors describe where it lives in the original; the rebuild may move, relabel and re-home
anything, so parity is checked on the key, never on DOM position.

## Entry types

| type | emits | fields |
|---|---|---|
| `single` | one key per entry in `keys` | `keys: { KEY: { selector, join?, exclude? } }` |
| `count` | one key per entry, value = `querySelectorAll().length` | `keys: { KEY: { selector } }` |
| `rows` / `list` | `<keyPrefix>.<id>.<suffix>` per row per cell, plus `<keyPrefix>.__row_count` | `rowSelector`/`selector`, `idFrom`, `cells`, `where?` |
| `digest` | `<keyPrefix>.row_count` and per column `.count` `.sum` `.min` `.max` | `rowSelector`, `columns: { name: tdIndex }` |

`idFrom` is `{ attr }`, `{ selector }`, or `{ text: true, strip?: regex }` — the row's **business
identity** (a fund code, a term name), so sorting and filtering cannot move a key.

A cell is a selector string or `{ selector, exclude }`. `exclude` strips nested elements before
reading text, which is how a figure is separated from a badge rendered inside the same cell.

## Resolution rule

A selector that matches **nothing** is `null` → **unresolved → gate failure**. A selector that
matches an element rendering empty text is `""` → **resolved**, because the original genuinely
draws nothing there (e.g. the role chip on a mid-level fund).

## Scenes and steps

An entry's `screen`, `view` (`before`/`after`) and `steps` form a *scene*. Every scene gets a
**fresh browser context**, so `sessionStorage` cannot leak between scenes or runs. Steps are the
documented default interactions, implemented in `scripts/snapshot.mjs`: `expandAll`,
`ltRow:CODE`, `rfxRow:CODE`, `rfxView:table|walk`, `stageFullscreen:str|sim`, `simFullReprice`,
`ownRow:N`, `ownSearch:CODE`, `issScope:LABEL`, `glsSearch:Q`, `glsChip:GROUP`.
