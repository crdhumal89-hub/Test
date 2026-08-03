/**
 * The only DOM helpers the UI uses. Deliberately tiny.
 *
 * Two rules encoded here, both from the rubric:
 *   - handlers attach with addEventListener, never as an `onclick` property or attribute, so
 *     nothing silently overwrites anything else (the original had 57 property assignments);
 *   - anything clickable is a real control with a role, a name and keyboard activation (R6).
 */

type Attrs = Record<string, string | number | boolean | null | undefined>;
type Child = Node | string | null | undefined | false;

/** Create an element. `class`, `text`, `html` and `data-*` are handled; everything else is an attribute. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Child[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'html') node.innerHTML = String(value);
    else node.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/** Replace a host's contents with new children, in one operation. */
export function replace(host: Element, ...children: Child[]): void {
  host.replaceChildren(...children.filter((c): c is Node | string => c != null && c !== false));
}

export function qs<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected an element matching ${selector}`);
  return found;
}

export function qsa<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

/**
 * A keyboard-operable control that is not a `<button>` — a table header that sorts, a tree row
 * that opens a drawer. Gets a role, a tab stop, and Enter/Space activation, so R6 holds without
 * anyone remembering to add it.
 */
export function activate(
  node: HTMLElement,
  handler: (event: Event) => void,
  options: { role?: string; label?: string } = {}
): void {
  if (options.role) node.setAttribute('role', options.role);
  if (options.label) node.setAttribute('aria-label', options.label);
  if (!node.hasAttribute('tabindex')) node.tabIndex = 0;
  node.addEventListener('click', handler);
  node.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handler(event);
    }
  });
}

/** A figure with its unit and, where the panel does not already carry one, its as-of date (R3). */
export function figure(
  value: string,
  options: { unit?: string; asof?: string; className?: string; title?: string } = {}
): HTMLElement {
  const node = el('span', {
    class: ['figure', options.className].filter(Boolean).join(' '),
    title: options.title,
  });
  node.append(el('span', { class: 'figure-value', text: value }));
  if (options.unit) node.append(el('span', { class: 'figure-unit', text: options.unit }));
  if (options.asof) node.append(el('span', { class: 'figure-asof', text: `as of ${options.asof}` }));
  return node;
}

/** The three states every data-dependent panel must be able to show (R4). */
export function loadingState(what: string): HTMLElement {
  return el('div', { class: 'state state-loading', role: 'status', 'aria-live': 'polite' }, [
    el('span', { class: 'spinner', 'aria-hidden': 'true' }),
    el('p', { text: `Loading ${what}…` }),
  ]);
}

export function emptyState(message: string, recovery?: { label: string; onAct: () => void }): HTMLElement {
  const node = el('div', { class: 'state state-empty', role: 'status' }, [el('p', { text: message })]);
  if (recovery) {
    const button = el('button', { type: 'button', class: 'btn', text: recovery.label });
    button.addEventListener('click', recovery.onAct);
    node.append(button);
  }
  return node;
}

export function errorState(
  message: string,
  detail?: string,
  recovery?: { label: string; onAct: () => void }
): HTMLElement {
  const node = el('div', { class: 'state state-error', role: 'alert' }, [
    el('p', { class: 'state-headline', text: message }),
    detail ? el('p', { class: 'state-detail', text: detail }) : null,
  ]);
  if (recovery) {
    const button = el('button', { type: 'button', class: 'btn', text: recovery.label });
    button.addEventListener('click', recovery.onAct);
    node.append(button);
  }
  return node;
}

/**
 * Trap focus inside an overlay while it is open, and restore it on close (R6d).
 * Returns the release function.
 */
export function trapFocus(container: HTMLElement, onEscape: () => void): () => void {
  const previous = document.activeElement as HTMLElement | null;
  const selector =
    'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = qsa<HTMLElement>(selector, container).filter((n) => n.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  container.addEventListener('keydown', onKeydown);
  const firstFocusable = qsa<HTMLElement>(selector, container)[0];
  firstFocusable?.focus();

  return () => {
    container.removeEventListener('keydown', onKeydown);
    previous?.focus();
  };
}
