/**
 * A searchable single-select. The original had three hand-rolled copies of this, each with its own
 * keyboard quirks; this is the one implementation all of them become.
 *
 * Keyboard: type to filter, ArrowUp/ArrowDown to move, Enter to pick, Escape to dismiss. Follows
 * the combobox pattern (`role="combobox"` + `aria-expanded` + `aria-activedescendant`) so a
 * keyboard user gets the same affordance as a mouse user (rubric R6).
 *
 * Empty results are never a dead end: the empty message names a recovery action (R18).
 */
import { el, replace } from './dom.js';

export interface ComboOption {
  key: string;
  /** What appears in the input once picked. */
  label: string;
  /** Secondary line under the label. */
  detail?: string;
  /** Small type tag on the left. */
  kind?: string;
  /** Lower-cased haystack this option is matched against. */
  haystack: string;
}

/**
 * The result list's own loading and error state (rubric R4).
 *
 * A combobox over a lazily fetched source has three states, not one: the options it can offer now,
 * the options it is still waiting for, and the options it will never get because the fetch failed.
 * Showing only the first is how a controller concludes a fund does not exist when the truth is that
 * the firm-wide file has not arrived. The notice rides at the top of the open list, so it is read at
 * the moment the list is consulted; the recovery action belongs to the caller, next to the input,
 * because a button inside a listbox popup is not a control a keyboard user can reach.
 */
export interface ComboNotice {
  kind: 'loading' | 'error';
  text: string;
}

export interface ComboConfig {
  id: string;
  placeholder: string;
  ariaLabel: string;
  /** Recomputed on every keystroke, so a lazily loaded source can grow underneath it. */
  options: () => ComboOption[];
  /** Read every time the list opens: what the list cannot show yet, and why. */
  notice?: () => ComboNotice | null;
  onPick: (option: ComboOption) => void;
  /** Shown when nothing matches. Should name what to do next. */
  emptyMessage?: string;
  initialValue?: string;
  maxResults?: number;
  /**
   * The documented default interaction this combobox satisfies, e.g. `step:ownSearch:CRIMAP`.
   * Published so the verification harness can drive it without knowing our ids, exactly as figures
   * publish `data-parity`. The option list publishes `<hook>:options`.
   */
  sceneHook?: string;
}

const DEFAULT_MAX = 50;

/**
 * The notice row. `aria-disabled` keeps it out of the pick set; the inner element carries the live
 * region, so a failure is announced (`role=alert`) rather than sitting silently at the top of a list
 * nobody re-reads.
 */
function comboNoticeItem(notice: ComboNotice): HTMLElement {
  return el(
    'li',
    { class: `combo-notice combo-notice-${notice.kind}`, role: 'option', 'aria-disabled': 'true' },
    [
      el('span', {
        class: 'combo-notice-text',
        role: notice.kind === 'error' ? 'alert' : 'status',
        text: notice.text,
      }),
    ]
  );
}

export function createCombobox(config: ComboConfig): HTMLElement {
  const listId = `${config.id}-list`;
  const input = el('input', {
    type: 'search',
    id: config.id,
    class: 'combo-input',
    role: 'combobox',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: config.placeholder,
    'aria-label': config.ariaLabel,
    'aria-expanded': 'false',
    'aria-controls': listId,
    'aria-autocomplete': 'list',
    ...(config.sceneHook ? { 'data-parity-scene': config.sceneHook } : {}),
  });
  if (config.initialValue) input.value = config.initialValue;

  const list = el('ul', {
    class: 'combo-list',
    id: listId,
    role: 'listbox',
    hidden: 'hidden',
    ...(config.sceneHook ? { 'data-parity-scene': `${config.sceneHook}:options` } : {}),
  });
  const wrap = el('div', { class: 'combo' }, [input, list]);

  let shown: ComboOption[] = [];
  let active = -1;

  const close = (): void => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };

  const highlight = (index: number): void => {
    active = index;
    const items = Array.from(list.querySelectorAll<HTMLElement>('li[data-index]'));
    items.forEach((item, i) => {
      const on = i === index;
      item.classList.toggle('on', on);
      item.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) {
        input.setAttribute('aria-activedescendant', item.id);
        item.scrollIntoView({ block: 'nearest' });
      }
    });
  };

  const pick = (option: ComboOption | undefined): void => {
    if (!option) return;
    input.value = option.label;
    close();
    config.onPick(option);
  };

  const open = (): void => {
    const query = input.value.trim().toLowerCase();
    const all = config.options();
    // Prefix matches first — a controller typing a fund code wants that code at the top.
    let results: ComboOption[];
    if (query) {
      const prefix: ComboOption[] = [];
      const substring: ComboOption[] = [];
      for (const option of all) {
        const at = option.haystack.indexOf(query);
        if (at === 0) prefix.push(option);
        else if (at > 0) substring.push(option);
        if (prefix.length >= 60) break;
      }
      results = prefix.concat(substring).slice(0, config.maxResults ?? DEFAULT_MAX);
    } else {
      results = all.slice(0, config.maxResults ?? DEFAULT_MAX);
    }
    shown = results;

    if (!results.length) {
      replace(
        list,
        el('li', { class: 'combo-empty', role: 'option', 'aria-disabled': 'true' }, [
          el('span', {
            text:
              config.emptyMessage ??
              `Nothing matches “${input.value.trim()}”. Clear the box to see everything.`,
          }),
        ])
      );
    } else {
      replace(list);
      results.forEach((option, i) => {
        const item = el('li', {
          id: `${listId}-${i}`,
          class: 'combo-option',
          role: 'option',
          'data-index': String(i),
          // `data-i` is the attribute the frozen harness selects options by.
          'data-i': String(i),
          'data-key': option.key,
          'aria-selected': 'false',
        });
        if (option.kind) item.append(el('span', { class: 'combo-kind', text: option.kind }));
        item.append(el('span', { class: 'combo-label', text: option.label }));
        if (option.detail) item.append(el('span', { class: 'combo-detail', text: option.detail }));
        item.addEventListener('mousedown', (event) => {
          event.preventDefault();
          pick(option);
        });
        list.append(item);
      });
    }
    const notice = config.notice?.() ?? null;
    if (notice) list.prepend(comboNoticeItem(notice));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    active = -1;
  };

  input.addEventListener('input', open);
  input.addEventListener('focus', open);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      if (list.hidden) open();
      highlight(Math.min(active + 1, shown.length - 1));
    } else if (event.key === 'ArrowUp') {
      highlight(Math.max(active - 1, 0));
    } else if (event.key === 'Enter') {
      pick(active >= 0 ? shown[active] : shown[0]);
    } else if (event.key === 'Escape') {
      close();
      return;
    } else {
      return;
    }
    event.preventDefault();
  });

  document.addEventListener('click', (event) => {
    if (!wrap.contains(event.target as Node)) close();
  });

  return wrap;
}
