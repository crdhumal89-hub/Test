/**
 * The five severity-grouped buckets, as accordions, plus the CSV that carries what the screen caps.
 *
 * Two things the original got wrong are fixed here. The accordion headers were mouse-only `div`s
 * with no role, no tab stop and no expanded state; they are `<button>`s now. And the row list was
 * silently cut at 200 with the remainder only implied — the cap is stated, attributed to the one
 * constant that owns it (`TRUNCATE.issueRows`), and the CSV that holds the rest is one click away.
 */
import { TRUNCATE } from '../../../../domain/exceptions.js';
import type { IssueBucket } from '../../../../domain/types.js';
import { el, replace } from '../../../primitives/dom.js';
import { parity } from '../../../parity.js';

/** The frozen parity keys sanitise a bucket name to `[A-Za-z0-9_.>-]`; reproduce that exactly. */
export function dataQualityBucketKey(name: string): string {
  return `data_quality.bucket.${name.replace(/[^A-Za-z0-9_.>-]+/g, '_')}`;
}

/** Plain language for what each severity obliges a controller to do. */
const DATA_QUALITY_SEVERITY_MEANING: Record<string, string> = {
  High: 'Fix before publishing: it can move a figure or dead-end a look-through.',
  Medium: 'Review: the engine works around it, but the mapping is not what it claims.',
  Low: 'Reference-data gap: nothing computes wrongly, but the entity cannot be identified cleanly.',
};

function dataQualityCsvRows(buckets: readonly IssueBucket[]): string {
  const quote = (value: string): string => `"${value.replace(/"/g, '')}"`;
  let csv = 'Severity,Bucket,VPM_Symbol,SPV_Code,Name,Detail\n';
  for (const bucket of buckets) {
    for (const row of bucket.rows) {
      csv +=
        `${bucket.sev},${quote(bucket.name)},${quote(row.sym ?? '')},${row.code},` +
        `${quote(row.name ?? '')},${quote(row.detail ?? '')}\n`;
    }
  }
  return csv;
}

/** Hand the browser a file. Revoked immediately after, so a long session does not leak blobs. */
export function dataQualityDownloadCsv(filename: string, buckets: readonly IssueBucket[]): void {
  const blob = new Blob([dataQualityCsvRows(buckets)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const anchor = el('a', { href: url, download: `issues_${filename.replace(/\W+/g, '_')}.csv` });
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface DataQualityBucketsOptions {
  buckets: readonly IssueBucket[];
  /** Which buckets are open. Local to the lens: an accordion is a reading aid, not application state. */
  open: ReadonlySet<string>;
  /**
   * Whether these counts are the unscoped, frozen-baseline ones. A scoped count is a different
   * figure, so it must not answer to a baseline key.
   */
  keyed: boolean;
  scopeLabel: string;
  onToggle: (name: string) => void;
}

function dataQualityRowList(bucket: IssueBucket): HTMLElement {
  const shown = bucket.rows.slice(0, TRUNCATE.issueRows);
  const list = el('ul', { class: 'dq-rows', 'aria-label': `${bucket.name} — rows` });
  for (const row of shown) {
    list.append(
      el('li', { class: 'dq-row' }, [
        el('span', { class: 'dq-row-sym mono', text: row.sym || row.code }),
        el('span', { class: 'dq-row-code mono', text: row.code }),
        el('span', { class: 'dq-row-detail', text: `${row.name ? `${row.name} — ` : ''}${row.detail}` }),
      ])
    );
  }
  return list;
}

export function renderDataQualityBuckets(host: HTMLElement, options: DataQualityBucketsOptions): void {
  const { buckets, open, keyed, scopeLabel, onToggle } = options;
  replace(host);

  for (const bucket of buckets) {
    const key = dataQualityBucketKey(bucket.name);
    const expanded = open.has(bucket.name);
    const bodyId = `dq-body-${bucket.name.replace(/\W+/g, '-')}`;

    const head = el('button', {
      type: 'button',
      class: 'dq-head',
      'aria-expanded': expanded ? 'true' : 'false',
      'aria-controls': bodyId,
      title: DATA_QUALITY_SEVERITY_MEANING[bucket.sev] ?? bucket.sev,
    });
    head.append(
      el('span', { class: `dq-dot dq-dot-${bucket.sev.toLowerCase()}`, 'aria-hidden': 'true' }),
      el('span', { class: 'dq-name', text: bucket.name }),
      el('span', {
        class: 'dq-count',
        ...parity(keyed ? `${key}.count_and_severity` : null),
        text: `${bucket.count} · ${bucket.sev}`,
      }),
      el('span', { class: 'dq-twist twist', 'aria-hidden': 'true', text: expanded ? '▾' : '▸' })
    );
    head.addEventListener('click', () => onToggle(bucket.name));

    const body = el('div', { class: 'dq-body', id: bodyId, hidden: expanded ? null : 'hidden' });
    body.append(
      el('p', {
        class: 'dq-expl',
        ...parity(keyed ? `${key}.explanation` : null),
        text: bucket.expl,
      })
    );

    const download = el('button', {
      type: 'button',
      class: 'btn',
      text: `⬇ Download this bucket (CSV) · ${bucket.rows.length} row${bucket.rows.length === 1 ? '' : 's'}`,
    });
    download.addEventListener('click', (event) => {
      event.stopPropagation();
      dataQualityDownloadCsv(`${bucket.name}_${scopeLabel}`, [bucket]);
    });
    body.append(download);

    // Rows are built only for an open bucket: a 200-row list has no business sitting in the DOM
    // behind a collapsed header. The count and the explanation above are always present.
    if (!bucket.rows.length) {
      body.append(
        el('p', {
          class: 'note',
          text: `No row in this bucket falls inside ${scopeLabel}. Nothing is hidden — the bucket is genuinely empty for this scope.`,
        })
      );
    } else if (expanded) {
      body.append(dataQualityRowList(bucket));
      if (bucket.rows.length > TRUNCATE.issueRows) {
        body.append(
          el('p', { class: 'note dq-truncated' }, [
            el('b', { text: `+${bucket.rows.length - TRUNCATE.issueRows} more (in CSV)` }),
            document.createTextNode(
              ` — this list stops at ${TRUNCATE.issueRows} rows. Use the download above for all ${bucket.rows.length}.`
            ),
          ])
        );
      }
    }

    host.append(
      el('section', { class: 'dq-bucket', 'data-dq-bucket': bucket.name }, [
        el('h3', { class: 'dq-bucket-title' }, [head]),
        body,
      ])
    );
  }
}
