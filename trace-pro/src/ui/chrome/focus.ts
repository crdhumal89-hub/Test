/**
 * Focus management for the chrome: getting focus INTO an overlay, and back OUT to where it came from.
 *
 * Split out of shell.ts, which had grown past the 400-line limit carrying four unrelated concerns.
 * Both halves below exist because of measured defects, and both are documented at the point of fix.
 */
import type { AppState } from '../../state/store.js';
/**
 * Put focus inside the drawer that just opened, if it is not there already.
 *
 * `trapFocus()` listens for Escape on the drawer CONTAINER, so a drawer the user cannot focus into is
 * a drawer they cannot dismiss with the keyboard. That is what happened when one drawer replaced
 * another: `replace(host)` above detaches the currently focused control, the browser moves focus to
 * the body, and the incoming drawer's own `trapFocus` call runs while its panel is still `hidden` —
 * so `focus()` on its first control is a silent no-op. Measured: pressing `g` from the page focused
 * `#glssearch` and Escape closed the glossary; pressing `g` from the Data sources drawer's upload slot
 * left focus on `#screen`, outside any dialog, and Escape did nothing at all. The glossary was
 * reachable and then not dismissable, with the masthead's own button occluded behind it.
 *
 * Deferred to a microtask so it runs after every subscriber has finished rendering and after the panel
 * is visible; guarded so it never steals focus from a drawer the user is already inside.
 */
export function focusIntoDrawer(host: HTMLElement): void {
  queueMicrotask(() => {
    const panel = host.querySelector<HTMLElement>('[role="dialog"]:not([hidden])');
    if (!panel) return;
    if (document.activeElement && panel.contains(document.activeElement)) return;
    const focusable = panel.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    (focusable ?? panel).focus();
  });
}

/* ------------------------------------------------------- focus restoration across overlays (R6d) */

/**
 * `trapFocus()` in primitives/dom.ts already returns a release function that refocuses the element
 * that was active when the overlay opened. It was being called — but by release time that element is
 * a DETACHED NODE, because the shell re-rendered the masthead and the screen re-rendered its tree
 * while the overlay was open, so `previous?.focus()` was a silent no-op and `document.activeElement`
 * came back as BODY for the glossary, the sources drawer and the row detail alike.
 *
 * Fixed by identity rather than by node reference: record a STABLE SELECTOR for the last control
 * focused outside any overlay, and refocus by lookup once every subscriber has finished re-rendering.
 * Survives any number of re-renders, and covers every overlay in the app — including the two row
 * detail drawers, which are mounted by screens rather than by this file.
 */
export const OVERLAY_SCOPE = '#drawer-host, .drawer, [role="dialog"]';
/** Attributes that identify a control across a re-render, in preference order after `id`. */
const STABLE_ATTRS = ['data-node-id', 'data-own-row', 'data-exception', 'data-code', 'data-lens', 'data-screen', 'data-view'];
/** Overlay-owning state: when one of these goes empty, its overlay has just closed. */
const OVERLAY_KEYS: (keyof AppState)[] = ['drawer', 'selectedNodeId', 'selectedFundCode'];

let focusReturn: string | null = null;

export function stableSelector(node: EventTarget | null): string | null {
  if (!(node instanceof HTMLElement) || node === document.body) return null;
  if (node.id) return `#${CSS.escape(node.id)}`;
  for (const attr of STABLE_ATTRS) {
    const value = node.getAttribute(attr);
    if (value != null) return `${node.tagName.toLowerCase()}[${attr}="${value.replace(/["\\]/g, '\\$&')}"]`;
  }
  return null;
}

/**
 * Refocus after the current notification finishes. Every screen subscribes after the shell does, so
 * a synchronous focus here would be thrown away by the re-render that follows it.
 */
export function restoreFocus(): void {
  const selector = focusReturn;
  if (!selector) return;
  queueMicrotask(() => {
    const node = document.querySelector<HTMLElement>(selector);
    if (node && !node.closest(OVERLAY_SCOPE) && node.isConnected) node.focus();
  });
}

export function closedOverlay(state: Readonly<AppState>, changed: ReadonlySet<keyof AppState>): boolean {
  return OVERLAY_KEYS.some((key) => changed.has(key) && state[key] == null);
}

/** Keep the chrome in step with state, and expose the keyboard route to the glossary (R7). */

/**
 * Record the last control focused OUTSIDE any overlay, so  has somewhere to return
 * to. Kept here with the variable it writes rather than in shell.ts, which is what left a dangling
 * reference when this module was split out.
 */
export function focusTrackOutsideOverlays(): void {
  document.addEventListener('focusin', (event) => {
    if ((event.target as Element | null)?.closest?.(OVERLAY_SCOPE)) return;
    const selector = stableSelector(event.target);
    if (selector) focusReturn = selector;
  });
}
