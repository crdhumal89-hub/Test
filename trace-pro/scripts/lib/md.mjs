/**
 * Markdown emission primitives shared by the evidence pack.
 *
 * Split out of scripts/evidence-pack.mjs so the pack can stay under the 400-line limit and so the
 * fence rule below lives in exactly one place.
 */

/** A pipe table from an array of rows (the caller supplies its own `---` separator row). */
export function table(rows) {
  return rows.map((r) => '| ' + r.join(' | ') + ' |').join('\n');
}

/** The longest run of consecutive backticks anywhere in `text` (0 if there are none). */
export function longestBacktickRun(text) {
  let longest = 0;
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return longest;
}

/**
 * Fence `text` VERBATIM.
 *
 * The previous version emitted a three-backtick fence and rewrote every ``` inside the captured
 * output to a soft-hyphen lookalike (`` `­`` `` ) so the fence could not be closed early. That
 * silently corrupted the very bytes the pack claims to reproduce: a gate log containing a fenced
 * block — an eslint report quoting markdown, a test name with a code span — came out of the pack
 * different from the log on disk, and nothing said so.
 *
 * CommonMark closes a fence only on a run of backticks at least as long as the opener, so a fence
 * longer than the longest run in the content is unambiguous with the content untouched. The floor of
 * four keeps the widened fence visible even when the content has no backticks at all.
 */
export function fence(text, lang = '') {
  const delim = '`'.repeat(Math.max(4, longestBacktickRun(text) + 1));
  // Trailing newlines only — trailing spaces on the last line are content and are preserved.
  return delim + lang + '\n' + text.replace(/\n+$/, '') + '\n' + delim;
}
