/**
 * Number formatting. Pure, no DOM.
 *
 * These are exact ports of the original's formatters, because parity is checked on rendered
 * strings. The original's names were single letters (`U`, `Uv`, `N`, `P`, `Uc`, `Ucv`) and two of
 * them collided with unrelated locals; see docs/redesign-spec.md §3.2.
 *
 * Precision rules, one per quantity class (rubric R17):
 *   money        0dp, thousands separators; negatives as -$X in prose, ($X) in tables
 *   unit price   6dp
 *   bps          1dp (0dp in the compact chips the original renders that way)
 *   percentage   2dp
 *   unit counts  0dp
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

/** was `fbps` — bps at 0dp with an explicit sign. */
export function formatBpsCompact(x: number | null | undefined): string {
  return x == null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(0) + ' bps';
}

/** was `BPSf` — a gap expressed in bps of a base, 1dp. */
export function formatBpsOf(gap: number, base: number): string {
  if (!base) return '—';
  const v = (gap / base) * 1e4;
  return (v >= 0 ? '+' : '') + v.toFixed(1) + ' bps';
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

/** A signed bps value at 1dp with no unit suffix (the Walk's Δ bps column). */
export function formatBpsSigned(x: number | null | undefined): string {
  return x == null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(1);
}

/** A signed price delta at 6dp (the Walk's Δ Price column). Null renders as the caller's em dash. */
export function formatPriceDelta(x: number | null | undefined): string | null {
  return x == null ? null : (x >= 0 ? '+' : '') + x.toFixed(6);
}
