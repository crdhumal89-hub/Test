/**
 * Number formatting. Pure, no DOM.
 *
 * These are exact ports of the original's formatters, because parity is checked on rendered
 * strings. The original's names were single letters (`U`, `Uv`, `N`, `P`, `Uc`, `Ucv`) and two of
 * them collided with unrelated locals; see docs/redesign-spec.md §3.2.
 *
 * PRECISION — ONE RULE PER QUANTITY CLASS (rubric R17). This block is the rule; every renderer in
 * `src/ui` formats through a function below and none formats a number itself.
 *
 *   money        0dp, thousands separators. Negatives read `-$X` in prose (`formatUsd`) and `($X)`
 *                in tables and ledgers (`formatUsdParens`) — one convention per context, which is
 *                the original's own and is why both exist. To the cent only where the figure is a
 *                tie-out: `formatUsdCents`. Compact (`$2.06bn` / `$412.5m`) only in a fixed-width
 *                tile or bar label, never in a table cell.
 *   unit price   6dp, always. `formatPrice`, or `formatPriceGrouped` where the price is wide
 *                enough to need thousands separators.
 *   bps          **1dp, explicit sign.** `formatBps` / `formatBpsOf` when the figure carries its
 *                own unit (` bps`), `formatBpsSigned` when the column header carries it (R3).
 *                Those two are the same precision with the unit hoisted, not two rules.
 *   percentage   2dp. `formatPercent`.
 *   unit counts  0dp, thousands separators. `formatCount`.
 *
 * TWO DECLARED EXCEPTIONS TO THE bps RULE, both forced by a frozen baseline string, both named
 * here with the key that forces them. An exception with a named cause is auditable; three
 * undocumented variants are the defect R17 describes.
 *
 *   (E1) 0dp, signed, ` bps` suffix — `formatBpsCompact`. Forced by
 *        `pricing.bridge.gap_bps` = "+10 bps gap", `pricing.bridge.driver.SPORTHLD.gap_bps` =
 *        "+153 bps", `pricing.bridge.driver.ASCHON.gap_bps` = "-958 bps",
 *        `pricing.bridge.driver.DUNK.gap_bps` = "+0 bps", and the composite
 *        `pricing.bridge.driver.*.gap_usd` = "$27,499,577+153 bps". All four are STRICT keys in
 *        `tests/baseline.json` (not declared relabels in `docs/rename-map.json`), so the gate
 *        compares them byte-for-byte and 1dp would fail it. Confined to the Pricing bridge.
 *   (E2) 0dp, UNSIGNED, no suffix — `formatBpsInteger`. Forced by the price table's bps column,
 *        `pricing.fund.<CODE>.pnl_bps` (26 STRICT keys: SPORTHFC "23", APRAIL2 "22", SPORTA "1",
 *        DEUCE "0", …). The unit is carried by the column header, pinned as the trailing "bps" of
 *        `pricing.table.column_headers`.
 *
 * Both exceptions are parity constraints on THIS baseline, not design intent: if the baseline is
 * ever re-cut, delete them and use `formatBps` / `formatBpsSigned`. No other module may render bps
 * at 0dp, and nothing outside `src/ui/screens/pricing/bridge.ts` and `price-table.ts` may call E1
 * or E2.
 */

const EN = 'en-US';

/** was `U` — money, minus sign. */
export function formatUsd(x: number | null | undefined): string {
  if (x == null) return '';
  return (x < 0 ? '-$' : '$') + Math.abs(x).toLocaleString(EN, { maximumFractionDigits: 0 });
}

/** was `Uv` — money, negatives in parentheses. */
export function formatUsdParens(x: number | null | undefined): string {
  if (x == null) return '';
  return (
    (x < 0 ? '($' : '$') +
    Math.abs(x).toLocaleString(EN, { maximumFractionDigits: 0 }) +
    (x < 0 ? ')' : '')
  );
}

/** was `N` — a unit count. Resolves the collision with the `N` reconciliation figure. */
export function formatCount(x: number | null | undefined): string {
  return x ? Math.round(x).toLocaleString(EN) : '0';
}

/** was `P` — a percentage at 2dp. */
export function formatPercent(x: number): string {
  return (x * 100).toLocaleString(EN, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

/** was `fpx` — a unit price at 6dp. */
export function formatPrice(x: number | null | undefined): string {
  return x == null ? '—' : x.toFixed(6);
}

/**
 * THE bps RULE: 1dp, explicit sign, unit written out. Every other bps formatter in this module is
 * either this function with the unit hoisted to a column header (`formatBpsSigned`) or one of the
 * two declared parity exceptions named in the module docstring.
 */
export function formatBps(x: number | null | undefined): string {
  return x == null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(1) + ' bps';
}

/** was `BPSf` — a gap expressed in bps of a base. The rule, applied to a gap and its base. */
export function formatBpsOf(gap: number, base: number): string {
  return formatBps(bpsOf(gap, base));
}

/**
 * EXCEPTION E1 — 0dp, signed, ` bps`. NOT the precision rule.
 *
 * was `fbps`. Kept at 0dp only because four STRICT baseline keys pin these exact strings:
 * `pricing.bridge.gap_bps` ("+10 bps gap"), `pricing.bridge.driver.SPORTHLD.gap_bps` ("+153 bps"),
 * `pricing.bridge.driver.ASCHON.gap_bps` ("-958 bps") and `pricing.bridge.driver.DUNK.gap_bps`
 * ("+0 bps"), plus the composites `pricing.bridge.driver.*.gap_usd`. Rendering them at 1dp changes
 * the digits and fails `npm run gate:parity`. Callers: `src/ui/screens/pricing/bridge.ts` only.
 */
export function formatBpsCompact(x: number | null | undefined): string {
  return x == null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(0) + ' bps';
}

/**
 * EXCEPTION E2 — 0dp, UNSIGNED, no suffix. NOT the precision rule.
 *
 * The price table's bps column, whose unit lives in the header. Pinned by the 26 STRICT keys
 * `pricing.fund.<CODE>.pnl_bps` — e.g. SPORTHFC "23", APRAIL2 "22", DEUCE2FC "1", SPORTC "0", and
 * "—" where the fund reports no NAV. Callers: `src/ui/screens/pricing/price-table.ts` only, which
 * currently inlines `bps.toFixed(0)`; routing it through here is the last step of R17 and is listed
 * in `docs/vocabulary-todo.md` because that file is owned elsewhere.
 */
export function formatBpsInteger(x: number | null | undefined): string {
  return x == null || !isFinite(x) ? '—' : x.toFixed(0);
}

/** bps of a base as a number, or null when the base is zero. */
export function bpsOf(gap: number | null, base: number | null | undefined): number | null {
  if (gap == null || !base) return null;
  return (gap / base) * 1e4;
}

function grouped(n: number, d: number): string {
  return Number(n).toLocaleString(EN, { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** was `Uc` — compact money ($2.06bn / $412.5m / $1,234). */
export function formatUsdCompact(x: number | null | undefined): string {
  if (x == null || !isFinite(x)) return '—';
  const a = Math.abs(x);
  const s = x < 0 ? '-' : '';
  if (a >= 1e9) return s + '$' + grouped(a / 1e9, 2) + 'bn';
  if (a >= 1e6) return s + '$' + grouped(a / 1e6, 1) + 'm';
  return s + '$' + grouped(a, 0);
}

/** was `Ucv` — compact money, negatives in parentheses. */
export function formatUsdCompactParens(x: number | null | undefined): string {
  if (x == null || !isFinite(x)) return '—';
  const a = Math.abs(x);
  const core = a >= 1e9 ? '$' + grouped(a / 1e9, 2) + 'bn' : a >= 1e6 ? '$' + grouped(a / 1e6, 1) + 'm' : '$' + grouped(a, 0);
  return x < 0 ? '(' + core + ')' : core;
}

/** was `MVn` — money to the cent. */
export function formatUsdCents(x: number | null | undefined): string {
  return x == null || !isFinite(x) ? '—' : (x < 0 ? '-$' : '$') + grouped(Math.abs(x), 2);
}

/** was `MVp` — money to the cent, negatives in parentheses. */
export function formatUsdCentsParens(x: number | null | undefined): string {
  if (x == null || !isFinite(x)) return '—';
  const a = Math.abs(x);
  return (x < 0 ? '($' : '$') + grouped(a, 2) + (x < 0 ? ')' : '');
}

/** was `PXf` — a price at 6dp, grouped. */
export function formatPriceGrouped(x: number | null | undefined): string {
  return x == null || !isFinite(x) ? '—' : grouped(x, 6);
}

/**
 * THE bps RULE with the unit hoisted to the column header — the Walk's `Δ bps` column, pinned by
 * `pricing.walk.fund.<CODE>.delta_bps` ("+22.6", "+1.9", "+0.0") and `pricing.walk.total.delta_bps`.
 * Same 1dp, same explicit sign as `formatBps`; only the suffix moves, which R3 requires and R17
 * does not count as a second precision.
 */
export function formatBpsSigned(x: number | null | undefined): string {
  return x == null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(1);
}

/** A signed price delta at 6dp (the Walk's Δ Price column). Null renders as the caller's em dash. */
export function formatPriceDelta(x: number | null | undefined): string | null {
  return x == null ? null : (x >= 0 ? '+' : '') + x.toFixed(6);
}
