/**
 * The Structure lens's three data states, kept out of the lens itself so neither file grows past
 * the length limit and so each state is one named function a test can point at (rubric R4).
 *
 * The distinction this module exists to draw: an EMPTY look-through file and a BROKEN one are not
 * the same event, and until now they landed on the same screen. `d3.stratify` throws `no root` for
 * both zero nodes and two roots, so a product whose file simply carries no entities was reported as
 * "the ownership structure could not be drawn" — an error state, complete with a re-thrown failure
 * for the console listener to trip over. Nothing had failed. The graph error state stays for the
 * genuinely broken tree (two roots, a dangling parent); this module owns the other two.
 */
import { el, emptyState, replace } from '../../../primitives/dom.js';

/** The head every state of the lens repeats: the question (R1) and the vocabulary line (R2). */
export type StructureHead = () => (Node | string)[];

/**
 * No entities to draw. A recovery action is required (R18) and reloading is the honest one: the
 * emptiness is in the product's data file, so there is no filter to widen and no scope to clear.
 */
export function structureMountEmpty(host: HTMLElement, head: StructureHead): () => void {
  replace(
    host,
    ...head(),
    el('div', { id: 'structure-empty' }, [
      emptyState(
        'This product’s look-through file lists no entities, so there is no ownership structure to draw. ' +
          'Nothing has failed — the file simply carries no holdings for this product and as-of date.',
        { label: 'Reload this product’s data', onAct: () => location.reload() }
      ),
    ])
  );
  return () => undefined;
}

/**
 * The caption before the graph exists. The counts come from the drawn graph, so until it is drawn
 * they are zero — and the previous version published those zeros as fact, reading "0 entities
 * joined by 0 ownership links, 6 levels deep" while the library was still loading. A figure that is
 * not yet known is not a figure of zero.
 */
export function structureCaptionLoading(caption: HTMLElement): void {
  replace(
    caption,
    document.createTextNode(
      'Text alternative for the graph: the entities and their ownership links are still loading, so no count is stated yet.'
    )
  );
}
