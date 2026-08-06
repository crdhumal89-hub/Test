/**
 * Keyboard-shortcut plumbing.
 *
 * One question, asked in one place: does this element consume typed characters? A bare-letter
 * shortcut must stand aside for someone who is typing, and must NOT stand aside for anyone who is
 * not — those are different tests, and conflating them is a real defect rather than a nicety.
 *
 * The shell's `g` (open the glossary) used to skip any `INPUT`. But `<input type="file">` accepts no
 * characters at all, and the Data sources drawer's two upload slots are file inputs one Tab from the
 * drawer's default focus. So from there the glossary was TWO actions away — close the drawer, then
 * press `g` — which is rubric R7's own failure clause. The masthead's Glossary button cannot supply
 * the missing action either: a modal drawer sits at `z-index: 40` over a masthead at `35`, so a click
 * at the button's coordinates lands on the drawer's header. Asking what the control actually consumes
 * fixes the keyboard route at the cause.
 */

/** Input types that accept no typed characters, so a letter key on them is a shortcut. */
const TEXTLESS_INPUT_TYPES = new Set([
  'file',
  'checkbox',
  'radio',
  'range',
  'color',
  'button',
  'submit',
  'reset',
  'image',
]);

/** True when a keystroke on `target` is text entry rather than a shortcut. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node) return false;
  if (node.isContentEditable) return true;
  if (node.tagName === 'TEXTAREA' || node.tagName === 'SELECT') return true;
  if (node.tagName !== 'INPUT') return false;
  const type = ((node as HTMLInputElement).type || 'text').toLowerCase();
  return !TEXTLESS_INPUT_TYPES.has(type);
}
