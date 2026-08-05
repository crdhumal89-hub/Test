# Progress Ledger — Indian Equity Screener, Phase 1

Written so a fresh session with no memory can resume from this file alone.

- **Repo:** `/home/user/Test` (remote `crdhumal89-hub/test`)
- **Branch:** `claude/equity-screener-phase-1-c3g3xv`
- **Spec (read-only, authoritative):** `/root/.claude/skills/investment-screener/references/strategies.md`
  and `.../sector-protocols.md`. All line references below are to those files.
- **Status:** HALTED at iteration 0, before writing any application code. Two
  structural blockers require the controller's decision. See "Blockers".

---

## 1. Baseline gate run (recorded before any change)

Run at iteration 0 on branch `claude/equity-screener-phase-1-c3g3xv`, commit `4f1088d`.

| # | Gate command | Exit | Observed output |
|---|---|---|---|
| 1 | `pytest -q` | **5** | `no tests ran in 0.00s` — exit 5 is pytest's "no tests collected" |
| 2 | spec-fidelity test | **n/a** | test does not exist yet |
| 3 | reference tests | **n/a** | tests do not exist yet |
| 4 | look-ahead guard + reproducibility | **n/a** | tests do not exist yet |
| 5 | `node playwright_gate.js http://localhost:8000` | **1** | `[FAIL] page did not load: net::ERR_CONNECTION_REFUSED` → `BLOCKED: 0/0 assertions passed, 0 console error(s)` |

**Baseline pass set: empty.** No test passed in the baseline, so no test can regress
from it. Every gate item is currently failing and all five must be driven to 0.

### Harness fixes applied to make the gate runnable (no application logic)

An unrunnable gate is a failure, not a pass, so these were fixed first:

1. `playwright_gate.js` copied from `/root/.claude/skills/loopforge/assets/gates/` to repo root.
2. `npm i -D playwright` (v1.62.1). Browsers are pre-installed at `/opt/pw-browsers`;
   `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` prevents a re-fetch.
3. Playwright 1.62.1 expects a browser revision the image does not carry, so
   `chromium.launch()` in the gate now passes
   `executablePath: process.env.GATE_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`.
   Verified: the gate now launches Chromium and fails with `ERR_CONNECTION_REFUSED`
   (correct — no app yet) rather than `MODULE_NOT_FOUND` / "download new browsers".
4. `pytest` is not importable as `python3 -m pytest`; the working binary is
   `/root/.local/bin/pytest`.

`ASSERTIONS` in the gate is still the template default and must be replaced with the
Definition of Done's page conditions before gate item 5 can mean anything.

---

## 2. Thresholds extracted from the spec (five in-scope strategies)

These are the values that belong in the single constants module. Every one carries its
spec file and line. Rows marked **AMBIGUOUS** are not yet resolvable and are the reason
the constants module has not been written — a guessed threshold is indistinguishable
from a correct one in output.

### Deep Value (Graham Net-Net) — strategies.md §"1. Deep Value (Graham Net-Net)", lines 9–11

| Constant | Value | Source |
|---|---|---|
| NCAV definition | Current Assets − Total Liabilities | strategies.md:10 |
| NCAV multiple | Market cap < **2/3** × NCAV | strategies.md:10 |
| Pick count | **5–10** — **AMBIGUOUS (C1)** | strategies.md:10 |
| Fallback proxy | P/B < **0.5** AND current ratio > **2**, tag `[E]` | strategies.md:11 |
| Behaviour on zero candidates | "absence of candidates IS a market signal" — render empty, never widen | strategies.md:10 |

### Piotroski-Enhanced Value — strategies.md §"3. Piotroski-Enhanced Value", lines 16–18

| Constant | Value | Source |
|---|---|---|
| Valuation filter | Low P/B, **bottom quintile** — **AMBIGUOUS (C3: quintile of what universe?)** | strategies.md:17 |
| F-Score cutoff | **≥ 7 of 9** | strategies.md:17 |
| F-Score components (9) | positive net income; positive operating CF; improving ROA; CF > net income; declining leverage; improving current ratio; no dilution; improving gross margin; improving asset turnover | strategies.md:17 |
| Pick count | **5** | strategies.md:17 |
| Fallback | "score ≥ 5/(available components) × 9", tag `[E]` + component count — **AMBIGUOUS (C2: formula is internally inconsistent)** | strategies.md:18 |

### Magic Formula (Greenblatt) — strategies.md §"4. Magic Formula (Greenblatt)", lines 20–21

| Constant | Value | Source |
|---|---|---|
| Factor 1 | ROC = EBIT / tangible capital employed — **AMBIGUOUS (C5: "tangible capital employed" undefined in spec)** | strategies.md:21 |
| Factor 2 | Earnings Yield = EBIT / EV | strategies.md:21 |
| Combination | Sum of the two ranks, lowest total wins | strategies.md:21 |
| Exclusions | financials and utilities — needs an authoritative sector classification | strategies.md:21 |
| Pick count | **10→5** — **AMBIGUOUS (C1: two numbers, no stated narrowing rule)** | strategies.md:21 |

### Quality Compounders (Buffett/Munger) — strategies.md §"6. Quality Compounders", line 31

| Constant | Value | Source |
|---|---|---|
| Return level | > **15%** | strategies.md:31 |
| Return metric | "ROIC/ROCE" — **AMBIGUOUS (C4: which one; they differ pre/post tax)** | strategies.md:31 |
| Year count | each of last **5** years | strategies.md:31 |
| FCF conversion | FCF / Net Income > **80%** | strategies.md:31 |
| Leverage | D/E < **0.5**, or net cash | strategies.md:31 |
| Pricing power | "stable/expanding gross margins" — **AMBIGUOUS (C4: no numeric definition of "stable")** | strategies.md:31 |
| Skin in the game | promoter/insider holding > **5%** | strategies.md:31 |
| Pick count | **5** | strategies.md:31 |

### Coffee Can Portfolio — strategies.md §"7. Coffee Can Portfolio", lines 33–35

| Constant | Value | Source |
|---|---|---|
| Revenue growth | ≥ **10%** | strategies.md:34 |
| ROCE | ≥ **15%** | strategies.md:34 |
| Year count | EACH of the last **10** years, no exceptions | strategies.md:34 |
| Pick count | **5** | strategies.md:34 |

Note: ten consecutive YoY revenue-growth observations require **eleven** fiscal years of
revenue history per company. This is a data requirement, not an ambiguity.

### Referenced by the Definition of Done but not used by any in-scope strategy

| Constant | Value | Source | Note |
|---|---|---|---|
| PEG limit | ≤ **1.0** | strategies.md:45 (GARP, strategy #9) | PEG appears nowhere in the five in-scope strategies. The DoD requires the spec-fidelity test to assert a PEG limit, so the plan is to carry `PEG_MAX = 1.0` in the constants module sourced from line 45 and assert it, without any strategy consuming it. Logged as an assumption; flagged to the controller, not treated as blocking. |

---

## 3. Blockers (both require the controller; neither is guessable)

### B1 — STRUCTURAL: there is no market data source

The task's Environment section reads `Market data source: [DATA SOURCE AND CREDENTIALS]`.
The placeholder was never filled. Evidence gathered:

- No market-data credentials in the environment. `env` exposes only GitHub, AWS,
  Google Cloud and Anthropic proxy tokens — nothing for any financial data vendor.
- No `.env` file in the repo or home directory.
- The environment's network policy denies market-data hosts at the egress proxy.
  `curl` returned `000` for `query1.finance.yahoo.com`, `www.nseindia.com` and
  `www.screener.in`; `$HTTPS_PROXY/__agentproxy/status` shows, for each,
  `"kind": "connect_rejected", "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)"`.
  Per `/root/.ccr/README.md`, 403 CONNECT is an organization policy denial and must be
  reported, not retried.

The task states the source "must expose, per figure, both the value and its publication
or filing date. If it cannot, stop and tell me before building." Beyond filing dates, the
Definition of Done imposes three further requirements that most sources cannot meet:

1. **Per-figure publication/filing date** — required by the look-ahead guard.
2. **Point-in-time universe including delisted companies** — the DoD names
   survivorship bias as a disqualifier, so a historical as-of date needs the constituent
   set as it stood on that date, not today's listed set.
3. **Eleven fiscal years of annual financials** — Coffee Can needs ten consecutive
   growth observations.
4. **Sector classification** (Magic Formula excludes financials and utilities) and
   **promoter/insider holding** (Quality Compounders).

Mocking, stubbing or hardcoding data to get past this is explicitly listed under "What
does NOT count as done", so no code was written against a placeholder adapter.

### B2 — SPEC AMBIGUITY: five threshold questions

The task says to halt rather than choose where the spec is ambiguous about a threshold.
All five below feed thresholds the DoD's spec-fidelity test must assert.

- **C1 — pick counts are ranges, not numbers.** Deep Value is "Picks: 5–10"
  (strategies.md:10); Magic Formula is "Picks: 10→5" (strategies.md:21) with no stated
  rule for narrowing ten to five. The DoD requires "each strategy's pick count" as a
  single asserted value.
- **C2 — the Piotroski fallback formula is internally inconsistent.**
  strategies.md:18 says "require score ≥ 5/(available components) × 9". With all 9
  components available it yields a cutoff of 5, contradicting the ≥7/9 base rule one line
  above. With 6 components available it yields 7.5 against a 6-point maximum, which is
  unsatisfiable. This is the DoD's "F-Score cutoff" and cannot be guessed.
- **C3 — "bottom quintile" of what population?** strategies.md:17. Quintile over the
  whole listed universe, the exchange, the sector, or the post-filter candidate set?
  Each produces a materially different shortlist. The same question applies to the
  universe over which Magic Formula ranks.
- **C4 — Quality Compounders has two under-specified criteria.** strategies.md:31 says
  "ROIC/ROCE" without saying which (they differ: post-tax on invested capital vs pre-tax
  on capital employed), and defines pricing power as "stable/expanding gross margins"
  with no numeric definition of "stable". Every criterion must render as pass or fail.
- **C5 — "tangible capital employed" is not defined in the spec.** strategies.md:21.
  Greenblatt's canonical definition is net working capital + net fixed assets, but the
  spec does not say so, and this drives the entire Magic Formula ranking.

---

## 4. Dead ends (ruled out, with evidence)

| Tried | Evidence it is ruled out |
|---|---|
| Reach a public market data endpoint directly | 403 CONNECT at the egress proxy for Yahoo Finance, nseindia.com, screener.in (see B1). Organization policy denial — not retryable. |
| Find vendor credentials already provisioned | `env` scan and `.env` search found none (see B1). |
| Default `chromium.launch()` in the gate | `MODULE_NOT_FOUND`, then "Please run npx playwright install". Fixed with `executablePath` at the image's Chromium path; gate now runs. |
| `python3 -m pytest` | `No module named pytest`. Working binary is `/root/.local/bin/pytest`. |

---

## 5. Definition of Done — current state

Every item is unmet. Nothing has been marked complete, because nothing has been observed
passing in gate output.

| # | Done item | State |
|---|---|---|
| 1 | App starts, screen page returns 200 | not started |
| 2 | Five strategies implemented, each naming its spec file and section | blocked by B2 |
| 3 | Spec-fidelity test over all thresholds, from one constants module | blocked by B2 |
| 4 | `pytest` exits 0 | not started (baseline exit 5, no tests) |
| 5 | Reference tests, 6 named companies incl. bank / cyclical / negative book value | blocked by B1 |
| 6 | Look-ahead guard test | blocked by B1 (needs per-figure publication dates) |
| 7 | Byte-identical output on re-run for same as-of date | blocked by B1 |
| 8 | Full audit trail on every row | blocked by B1 |
| 9 | `[E]`-tagged fallback proxies with component count, no untagged substitution | blocked by B1 + B2 (C2) |
| 10 | Zero-candidate strategies render an explicit reason, never widened | blocked by B1 |
| 11 | `node playwright_gate.js` exits 0, zero console errors | harness runnable; ASSERTIONS not yet filled; app does not exist |
| 12 | No baseline test regressed | trivially held — baseline pass set is empty |

---

## 6. Current hypothesis / next step on unblock

The build order in the operating loop is sound and unchanged: constants module → data
adapter with the fallback-proxy contract → audit-trail record type → test harness
(look-ahead guard + spec-fidelity test) → five strategies → page. Nothing above the data
adapter can be written honestly until B1 names a source, and the constants module cannot
be written until B2's five questions are answered.

The one piece of work that depends on neither is filling the gate's `ASSERTIONS` array
from the DoD's page conditions (audit-trail columns per row, `[E]` tag plus component
count on proxy rows, explicit empty-result reason, no console errors). That is the first
action to take on unblock, or sooner if the controller wants progress in the meantime.
