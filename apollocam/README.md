# ApolloCAM — Apollo Cash Automation & Management

**Apollo Global Management · Mumbai · Fund Controllership**

ApolloCAM automates the daily cash-management workflow for the 11 AAA funds
(~$25B complex): checking balances against floors/ceilings, proposing inter-fund
wires and spot-FX conversions, generating IVP/Trade/Spot-FX loader files,
forecasting cash 14 days forward, and tracking each wire to confirmation — all
with an immutable audit trail for EY review.

It ships in two interchangeable forms backed by the same business logic:

| Form | File | Use it when |
|------|------|-------------|
| **Streamlit web app** | `app.py` + `pages/` + `core/` | Daily driver. Multi-page UI, SQLite store, loader downloads. |
| **Self-contained Excel workbook** | `ApolloCAM.xlsx` (+ `vba/modApolloCAM.bas`) | No-Python fallback / cross-check. All logic lives in worksheet formulas; VBA is I/O-only. |

---

## 1. Quick start (web app)

```bash
cd apollocam
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                   # then edit .env (see §5)
streamlit run app.py
```

The app opens at `http://localhost:8501`. On first launch it creates and seeds
`data/apollocam.db` (11 funds, FX rates, thresholds, 2026 holiday calendar,
default settings). The database is git-ignored — it is your live working store.

**Requirements:** Python 3.11+ and the packages in `requirements.txt`
(`streamlit`, `pandas`, `openpyxl`, `python-dotenv`, `pytest`).

---

## 2. The daily workflow

The sidebar lists the pages in the order you use them each morning.

1. **Import Data** — Upload the JPM daily position file (CSV or Excel). Column
   order doesn't matter; headers are matched by alias (`Fund_Code`/`Fund`,
   `Cash_Balance_Local`/`Balance`/`Closing Balance`, `CCY`/`Currency`,
   `Report_Date`/`As of Date`, …). Required columns: fund code, CCY, balance,
   report date. Rows with an unparseable balance **or** date are excluded and
   reported, never silently committed. Review the preview, then **Confirm
   Import**. The run date is taken from the file's `Report_Date`.

2. **Dashboard** — KPI cards (total cash, RED/AMBER/GREEN/BLUE counts), a RED
   alert banner, an 11-fund status grid, and the full position table. Status
   model:
   - **RED** — cash < floor
   - **AMBER** — floor ≤ cash < floor × 1.10 (buffer configurable)
   - **GREEN** — floor × 1.10 ≤ cash ≤ ceiling
   - **BLUE** — cash > ceiling (excess)

3. **Status Review** — Same data with filters, sort, a per-fund balance trend
   (needs ≥2 days of history), and CSV export.

4. **Proposals** — Click **Run Proposals** to generate wire + FX proposals from
   current positions. Wires: RED funds sorted by largest deficit, sourced from
   each fund's `routing_source`, amount = min(deficit, source surplus above
   floor), with working balances reduced sequentially. FX: sell
   `(local − min_hold)` of each excess non-USD holding. Decide each
   (APPROVE / SKIP / HOLD) or **Approve All Wires**; a post-transfer preview
   shows every fund's resulting status.
   > Re-running **clears all proposals for that run date** and regenerates them,
   > so prior decisions are reset — this is deliberate, to prevent an approved
   > wire from being duplicated alongside a fresh copy.

5. **Loaders** — Generate the three values-only loader files for approved
   proposals: **IVP Wire** (`.xlsx`), **Trade Booking** (`.csv`, 2 legs/wire),
   **Spot FX** (`.xlsx`). Each shows a row count and a SHA-256 fingerprint;
   download individually or as a ZIP. No formulas are ever exported — files are
   static for IVP submission.

6. **14-Day Forecast** — Optionally import a JPM Call/Distribution file, then see
   each fund's projected cash and status over the next 14 days. Non-USD pipeline
   events are converted to USD; a "days to RED" column flags funds heading
   underwater.

7. **Wire Status** — Kanban tracker (Proposed → Approved → Loader Generated →
   Submitted → Confirmed) with a form to advance status and record the bank/IVP
   confirmation reference.

8. **Audit Log** — Immutable, filterable event history with CSV export. Enforced
   at the database level by `BEFORE UPDATE/DELETE` triggers — no row can be
   edited or deleted.

9. **Settings** — Admin-gated (see §5). Edit the fund master, FX rates, FX
   thresholds, global settings, and holiday calendar. Every save is atomic and
   audit-logged.

---

## 3. The Excel workbook

`ApolloCAM.xlsx` reproduces the whole workflow in seven sheets — **HOME,
DASHBOARD, PROPOSALS, LOADERS, SETTINGS, _DATA, _AUDIT** — pre-seeded with the
June 2026 scenario. **All calculations are worksheet formulas**, so an auditor
can trace every status, deficit, and wire amount in the formula bar.

To enable the macro buttons (import, export loaders, email digest):

1. Open `ApolloCAM.xlsx`, save as `ApolloCAM.xlsm` (macro-enabled).
2. `Alt+F11` → **File → Import File** → select `vba/modApolloCAM.bas`.
3. Save again. The macros are **I/O-only** — they read/write cells and files but
   never compute business values; the formulas remain the single source of truth.

`build_excel.py` regenerates `ApolloCAM.xlsx` from seed data if you ever need a
clean copy: `python build_excel.py`.

---

## 4. Cross-checking the two tools

Both implementations are validated against the same June 2026 figures, so you
can reconcile the app against the workbook:

- Status counts: **RED 3, AMBER 2, GREEN 4, BLUE 2**
- Wires: SF1Y → DL-Y **$177,734**; AGG → IDF-AGG **$60,365**; SF1Y → SF1YS **$21,899**

These are asserted by the test suite (§6), so a code change that breaks parity
fails CI.

---

## 5. Configuration & security

**Admin password.** The Settings page is gated. Resolution order: the
`ADMIN_PASSWORD` environment variable (from `.env`) **overrides** the database
value when set. The seeded database default is `ApolloCAM_ChangeMe!` — change it
immediately (set `ADMIN_PASSWORD` in `.env`, or update it under Settings →
Global Settings).

**.env (never committed — it's git-ignored):**

```
SMTP_HOST=            # blank → Windows Outlook COM fallback
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=        # keep secrets here, never in source or the DB
ADMIN_PASSWORD=change-this-before-use
DB_PATH=              # optional; defaults to data/apollocam.db
```

**Audit immutability** and **values-only loaders** are enforced in code (DB
triggers; CSV/XLSX written without formulas) — not by convention.

---

## 6. Testing & CI

```bash
cd apollocam
python -m pytest -q
```

The suite has two layers:

- **`tests/test_engine.py`** — business-logic unit tests (status, FX, wire/FX
  proposals, forecast, loaders) plus regression tests for every audit fix.
- **`tests/test_pages_smoke.py`** — runs **all 9 pages + the home app** headlessly
  via `streamlit.testing.v1.AppTest` against a fully seeded database and asserts
  each renders with no exception. This catches library-version regressions
  (e.g. a pandas API removal) that unit tests miss.

GitHub Actions (`.github/workflows/ci.yml`) runs the full suite on every push
and pull request.

---

## 7. Known limitations

- **Email alerts are manual.** The notification engine (`core/email_notify.py`)
  is fully implemented and the **Settings → Send Test Digest** button sends a
  real digest, but alerts are **not** auto-triggered on import or end-of-day.
  Delivery needs `SMTP_HOST` configured, or Windows Outlook for the COM
  fallback; with neither, a queued email is logged as failed rather than sent.
  Wiring automatic RED-alerts-on-import is a deliberate opt-in left to the
  controller.
- **No authentication beyond the admin gate.** This is a single-user controller
  tool by design; the Settings password is the only access control.
- **Wire-status transitions are unrestricted** — the tracker allows correcting a
  status in any direction (intended for a single operator fixing mistakes).
```
