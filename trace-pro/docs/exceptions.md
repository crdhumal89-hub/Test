# Exceptions register — inline handlers and `!important`

**Current state: there are no exceptions. Zero inline `on*=` handler attributes and zero
`!important` declarations exist in the shipped sources.**

This file exists because Definition-of-Done item 8 is *"zero inline `onclick`, zero `!important`,
**or** documented in `docs/exceptions.md`"*, and `scripts/check-limits.mjs` enforces that literally:
it collects every inline handler attribute and every `!important` it finds in the shipped UI sources
and fails the build for each one **whose `path:line` does not appear in this file**. So this is not
prose — it is the allowlist the checker reads. An empty allowlist is the strongest state it can be
in, and the point of writing the file now is that the register exists before anyone is tempted to
argue for the first entry.

## What the checker reported

Run on the working tree while writing this file:

```
$ node scripts/check-limits.mjs
checked 34 files (20 shipped UI sources)
  top-level identifiers in src/: 179, all unique
  inline on*= attributes: 0
  !important declarations: 0

STRUCTURE CHECK PASSED
```

Re-run twelve minutes later, after more of the UI had landed, the two counts this file governs were
unchanged:

```
$ node scripts/check-limits.mjs
checked 66 files (45 shipped UI sources)
  top-level identifiers in src/: 359, all unique
  inline on*= attributes: 0
  !important declarations: 0

  FILE TOO LONG  src/ui/screens/diagnose/structure/graph.ts — 427 lines (max 400)

STRUCTURE CHECK FAILED (1)
```

That second run failed, and the failure is recorded here rather than omitted — but it is the
400-line rule on a file that was mid-write, not an exception of the kind this register governs. This
file makes no claim about the other three structural checks; the current state of all of them is
`docs/ledger.md`, and the command above is the source of truth.

## Scope of the two rules

`scripts/check-limits.mjs` scans **shipped UI sources only** — everything under `src/`, plus
`index.html` and the stylesheets. Harness scripts under `scripts/` are excluded because they are not
shipped, and the checker necessarily contains the very patterns it searches for. It strips `/* */`
and `//` comments before scanning, so prose *about* `!important` (there is some, in the header of
`src/ui/styles/app.css`) is not mistaken for a declaration.

Two things it deliberately does **not** catch, so they are not silently in scope:

- **`element.onclick = fn` property assignment in TypeScript.** That is a different defect from an
  inline markup attribute, and the original had 57 of them. The rebuild's structural answer is that
  `src/ui/primitives/dom.ts` exposes `addEventListener` only; there is no property assignment in
  `src/` today, and it is caught by review rather than by this checker.
- **Inline `style="…"` attributes.** Not one of the two rules. Several exist (the Structure lens's
  stage geometry, the tree's per-level indent) and they are legitimate — they carry computed
  geometry, not styling that belongs in a stylesheet.

## For reference: what was being fixed

The original carried **61** `!important` declarations, verified against
`reference/TRACE-Pro-original.html`, and **zero** inline `on*=` attributes — it was already clean on
the second rule and the rebuild's obligation was to stay that way. Spec question Q6 recommended
driving `!important` to zero by fixing specificity rather than by exempting anything, and reporting
the real survivor count. The real count is zero. See `docs/issues.md` §H and §I.

---

## The register

*(empty)*

| # | `path:line` | Rule | Reason it cannot be removed | Owner | Date |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

### How to add an entry, if one ever becomes necessary

1. The entry **must** contain the literal `path:line` string exactly as `check-limits.mjs` prints
   it — `src/ui/styles/components.css:214` — because the checker matches on that substring. Nothing
   else in the row is read by the machine; all of it is read by the next engineer.
2. The reason must say what was tried and why it failed. "Specificity fight with a third-party
   stylesheet" is a reason. "Needed for layout" is not: `!important` never fixes a layout, it only
   wins a specificity argument, and the argument is the thing to fix.
3. Name an owner and a date. An entry with no owner is a permanent exception pretending to be a
   temporary one.
4. An inline handler attribute needs a stronger reason than a `!important` does, because
   `addEventListener` is always available and inline handlers silently overwrite one another. The
   expected answer is that there is no acceptable reason.
5. Line numbers move. If an entry's line number goes stale the checker fails again, which is the
   intended behaviour: it forces the exception to be re-justified rather than inherited.
