/**
 * Reading a delimited file the way the original read one, and no more cleverly.
 *
 * These four functions are ports of `splitCsv`, `pnum`, `nrmH` and `normFundCode` (original 1404,
 * 1405, 1436, 1447). They exist as a module because both uploaded files are read through them, and
 * because their robustness is hard-won rather than obvious: a fund code arriving with a non-breaking
 * space instead of a space still has to join to the model, and `#N/A`, `—`, `(1,234.50)` and
 * `$1,234.50` all have to read as what an accountant means by them.
 */

/** One line of a comma-separated file, honouring `""` escapes inside quoted cells. Was `splitCsv`. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cell);
      cell = '';
    } else cell += ch;
  }
  out.push(cell);
  return out;
}

/** Split text into rows of cells. Trailing blank lines are dropped, blank lines inside are kept. */
export function csvRows(text: string): string[][] {
  const lines = text.split(/\r?\n/);
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.map(splitCsvLine);
}

/**
 * A figure as a spreadsheet writes it, or null when the cell holds no figure. Was `pnum`.
 * `(1,234.50)` is negative — the accounting convention this app renders in (R17).
 */
export function parseFigure(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let text = String(raw).trim().replace(/,/g, '').replace(/\$/g, '');
  if (text === '' || text === '-' || text === '—' || /^#/.test(text)) return null;
  const negative = /^\(.*\)$/.test(text);
  text = text.replace(/[()]/g, '').trim();
  if (text === '' || text === '-') return null;
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/**
 * Does this cell MEAN "no figure", as against holding one this reader cannot make sense of?
 *
 * `parseFigure` answers null to both, and the difference decides whether a file can be trusted. A
 * fund that reports no NAV leaves the cell empty, or writes `-`, `—`, `#N/A` or the `nan` / `none` /
 * `NaT` a dataframe export emits: all of those are a stated absence and the row is simply skipped.
 * A cell holding WORDS is a column that is not the column its header claims to be, and reading a
 * whole book of prices out of it would be a silent fabrication — so the callers refuse instead.
 */
export function isBlankFigure(raw: unknown): boolean {
  const text = String(raw ?? '')
    .trim()
    .replace(/,/g, '')
    .replace(/\$/g, '')
    .trim();
  if (text === '' || text === '-' || text === '—' || text.startsWith('#')) return true;
  return /^(nan|none|nat)$/i.test(text);
}

/** A header cell reduced to letters and digits, so spacing, case and punctuation cannot matter. */
export function normaliseHeader(raw: unknown): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * A cell as the original read one: newlines flattened, trimmed, and the three spellings a
 * spreadsheet export uses for "nothing" treated as nothing. Was `norm` (original 1039). It does NOT
 * upper-case, because these values are the model's own spelling of an entity's name and code.
 */
export function normaliseCell(raw: unknown): string {
  if (raw == null) return '';
  const text = String(raw).replace(/\n/g, ' ').trim();
  return /^(nan|none|nat)$/i.test(text) ? '' : text;
}

/**
 * A fund code hardened for joining: non-breaking spaces removed, inner whitespace collapsed,
 * trimmed, upper-cased. Was `normFundCode`, and it is the reason a hand-edited feed still joins.
 */
export function normaliseCode(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}
