/**
 * The derivation inspector: why one row's two percentages are what they are.
 *
 * A controller who is told "CSTR owns 11.45%" cannot check it. So the panel shows the division that
 * produced the direct share, then the multiplicative ladder that chains every hop on the path back
 * down to the searched position. Each code on the ladder is a control, so following the chain is
 * one keystroke rather than a re-search.
 */
import { formatCount, formatPercent } from '../../../../domain/money.js';
import type { OwnerRow, OwnershipGraph } from '../../../../domain/ownership.js';
import { displayName, totalQuantity, vpmSymbol } from '../../../../domain/ownership.js';
import { el, replace } from '../../../primitives/dom.js';
import { parity } from '../../../parity.js';

/** Before any row is chosen: say what a click will buy, rather than showing an empty box. */
export function renderOwnershipDerivationPrompt(host: HTMLElement): void {
  const card = el('div', { class: 'own-derivation own-derivation-empty' });
  const hint = el('p', { class: 'note' });
  hint.append(
    document.createTextNode('Choose any owner row to see '),
    el('b', { text: 'qty ÷ total = direct share' }),
    document.createTextNode(' and the full chain of shares multiplied up to that owner.')
  );
  card.append(el('h3', { text: 'Derivation' }), hint);
  replace(host, card);
}

export interface OwnershipDerivationOptions {
  graph: OwnershipGraph;
  root: string;
  row: OwnerRow;
  /** Follow a code on the ladder: make it the searched position. */
  onFollow: (code: string) => void;
}

export function renderOwnershipDerivation(
  host: HTMLElement,
  options: OwnershipDerivationOptions
): void {
  const { graph, root, row, onFollow } = options;
  const parentTotal = totalQuantity(graph, row.parent);
  const ultimate = graph.ultimates.has(row.holder);
  const rootSymbol = vpmSymbol(graph, root);

  const card = el('div', { class: 'own-derivation' });

  card.append(
    el('h3', {
      class: 'own-derivation-title',
      ...parity('ownership.derivation.title'),
      text: `${ultimate ? 'Ultimate owner' : 'Owner'} — how this % is derived`,
    }),
    el('p', {
      class: 'own-derivation-headline',
      ...parity('ownership.derivation.headline'),
      text: `${row.holder} owns ${formatPercent(row.direct)} of ${row.parent}`,
    }),
    el('div', { class: 'own-bar', role: 'presentation' }, [
      el('i', { style: `width:${Math.min(100, row.direct * 100)}%` }),
    ])
  );

  const equation = el('p', { class: 'own-equation', ...parity('ownership.derivation.equation') });
  equation.append(
    el('b', { text: formatCount(row.units) }),
    document.createTextNode(' units held ÷ '),
    el('b', { text: formatCount(parentTotal) }),
    document.createTextNode(` total units of ${row.parent} = `),
    el('b', { class: 'own-equation-result', text: formatPercent(row.direct) }),
    document.createTextNode(' '),
    el('span', { class: 'own-equation-unit', text: 'immediate' })
  );
  card.append(
    equation,
    el('p', {
      class: 'note',
      text: `Direct share (of the level below). ${displayName(graph, row.holder)} holds those units of ${displayName(graph, row.parent)}.`,
    })
  );

  card.append(
    el('h3', { class: 'own-derivation-sub', text: `Cumulative — effective share of ${rootSymbol}` })
  );

  const ladder = el('div', {
    class: 'own-ladder',
    ...parity('ownership.derivation.ladder'),
  });
  const chip = (code: string, label: string): HTMLElement => {
    const button = el('button', {
      type: 'button',
      class: 'own-chip',
      'data-code': code,
      title: `Make ${displayName(graph, code)} the searched position`,
      text: label,
    });
    button.addEventListener('click', () => onFollow(code));
    return button;
  };

  ladder.append(chip(root, rootSymbol));
  for (const step of row.chain) {
    ladder.append(
      document.createTextNode(' '),
      el('span', { class: 'own-ladder-op', text: `×${(step.direct * 100).toFixed(1)}%→` }),
      document.createTextNode(' '),
      chip(step.code, step.code)
    );
  }
  ladder.append(
    document.createTextNode(' '),
    el('span', { class: 'own-ladder-total', text: `= ${formatPercent(row.cumulative)}` })
  );
  card.append(ladder);

  card.append(
    el('p', {
      class: 'note',
      text:
        row.chain.length > 1
          ? `${row.chain.length} hops multiplied together. Each ×% is that hop's direct share of the entity below it; the product is the effective share of ${rootSymbol}.`
          : `One hop, so the effective share of ${rootSymbol} equals the direct share above.`,
    })
  );

  if (row.cyclic) {
    card.append(
      el('div', { class: 'callout callout-warn' }, [
        el('div', { class: 'callout-title', text: 'Circular holding' }),
        el('p', {
          text: `${row.holder} already appears lower on this chain, so the walk stops here instead of looping. The effective shares in the rollup are solved by fixed point and are unaffected, but the chain shown above is truncated at this row.`,
        }),
      ])
    );
  }

  replace(host, card);
}
