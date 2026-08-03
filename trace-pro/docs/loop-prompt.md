# TRACE-Pro completion loop prompt

Compiled by LoopForge. Paste into Claude Code at `[REPO PATH]` to resume or re-run the build to
done. Every placeholder below is already resolved for this repo; they are marked so the prompt
stays reusable for a different product or as-of date.

```
# Mission
You are a senior frontend engineer finishing a rebuild of Apollo's TRACE-Pro look-through and
repricing engine. A 934 KB single-file HTML app has already been re-architected into a multi-file
TypeScript application: the pricing and look-through math is extracted into pure modules, the
614 KiB of embedded data is now runtime fixtures, and the Reconciliation screen is built and at
parity. Your job is to finish the remaining screens and certify the whole thing against a frozen
parity baseline, without changing a single figure the tool reports.

Success is one state: every Definition of Done item below passes the verification gate, and the
evidence pack proves it. Not "looks right" — passes.

# Read first, every iteration
- docs/ledger.md — what was tried, what passes, what remains, the live hypothesis. Read it before
  planning so you never repeat a failed fix or circle.
- docs/redesign-spec.md — the screen inventory, the approved information architecture
  (Reconciliation / Pricing / Diagnose with four lenses), the rename table, the module plan.
- docs/ux-rubric.md — the 18 pass/fail criteria. FROZEN. Authored before the code it grades.
- parity-map.json and tests/baseline.json — FROZEN. 1,020 semantic keys and their observed values
  from the original.

# Definition of Done
Done only when ALL of these are objectively true, each proven by gate output and not by judgment:
- [ ] `npm run build`, `npm run typecheck`, `npm run lint` all exit 0.
- [ ] `npm test` exits 0. The extracted math modules keep direct unit tests covering the ownership
      solve, the look-through walk, the repricing cascade, and the reconciliation bridge.
- [ ] `npm run gate:parity` reports ZERO value diffs across all 1,020 keys against
      tests/baseline.json. A missing or unresolved key is a failure, not a pass.
- [ ] The Playwright suite passes: all three screens and all four lenses render, every documented
      interaction completes, all four exports produce a non-empty file whose figures tie to the
      screen, and the run logs zero console errors and zero unhandled rejections.
- [ ] Every criterion in docs/ux-rubric.md passes an INDEPENDENT critic pass with cited evidence.
- [ ] No source file exceeds 400 lines. No source file contains a data literal over 2,000
      characters. Fixtures load at runtime from data/.
- [ ] Zero duplicate top-level identifiers across modules, enforced by the linter.
- [ ] Zero inline on*= attributes and zero !important declarations, or each survivor is listed in
      docs/exceptions.md with a reason.
- [ ] The app runs with the network disabled.
- [ ] README.md explains the file tree, how to run it, how to point it at a different product and
      as-of date, and what each screen answers.

# The label-parity split (already approved — do not relitigate)
983 keys must be byte-identical to the baseline. 37 non-glossary label keys carry vocabulary the
rename table deliberately changes; for those the gate requires the rendered string to equal the
value declared in docs/rename-map.json, AND requires the numeric tokens inside that string to be
an identical sequence to the baseline's. Words may change; digits may not. An undeclared relabel is
a gate failure. Neither parity-map.json nor tests/baseline.json is ever edited.

# Operating loop
Each iteration: PLAN the smallest next step toward one unmet Done item. ACT. VERIFY by running the
gate and reading the ENTIRE output including every failure. REFLECT on root cause, not symptom.
Update docs/ledger.md with what you tried, which sub-gates pass, the current parity diff count, and
your live hypothesis for the top remaining failure. REPEAT.

Migrate one screen at a time and keep the app runnable with the gate green after each, rather than
tearing everything down at once. When a parity diff appears, it is attributable to the layer you
just touched — that is the whole reason the math was extracted and differentially tested first.

# Verification gate
"Tested" means all four sub-gates pass in the same run. None may be skipped.
1. STATIC: `npm run build` + `npm run typecheck` + `npm run lint`, all exit 0.
2. UNIT: `npm test`, exit 0, zero failures.
3. PARITY: `npm run gate:parity` — zero value diffs, zero unresolved keys.
4. UX CRITIC: re-read docs/ux-rubric.md with fresh, skeptical eyes as a reviewer who did not design
   this. Score every criterion pass or fail and cite concrete evidence per criterion — a screenshot
   path, a DOM assertion in a named test, or a file:line. Passes only when all 18 pass with
   evidence. Write the scorecard to docs/ux-scorecard.md.
If a sub-gate cannot run, that is a failure to fix, not a pass.

# What does NOT count as done
- Editing parity-map.json, tests/baseline.json, or docs/ux-rubric.md to make a check pass. Those
  three are frozen. If you believe one is genuinely wrong, say so in the ledger and in your final
  report with your reasoning — do not amend it silently.
- Deleting or weakening a parity key, a unit test, or a rubric criterion.
- Splitting files cosmetically while leaving data embedded in source.
- Grading the rubric as the designer rather than as an independent critic, or scoring a criterion
  without evidence to cite.
- Reporting a pass you did not observe in gate output.
A temptation toward any of these means the underlying problem is unsolved. Say what is unsolved.

# Environment
Repo: [REPO PATH] (this build: /home/user/Test/trace-pro). Stack: Vite + TypeScript + Vitest +
Playwright, already configured. Chromium is pre-installed; never run `playwright install`.
Fixtures: data/[PRODUCT SLUG]/[AS-OF]/*.json, selected by ?product=&asof=.
Do not modify: reference/*.html (the frozen original, sibling module, and platform shell), beyond
the one line the shell needs to host the new build.
Commit after each green gate, with a message naming the screen or module and the parity status.

# Stop conditions
STOP and report success when every Done item passes. Deliver: the file tree, the full gate output
pasted verbatim, the parity diff showing zero, the rubric scorecard with evidence, and a short
summary of what changed per screen.
HALT and ask only on a hard blocker, on a parity diff you cannot explain after three attempts, or
after twelve iterations with no net progress — stating precisely what blocks you, what you tried,
and the options you see. Otherwise decide and proceed, recording the decision in the ledger.
```

## Why this loop terminates correctly

Three structural choices carry it. **The gate is external and numeric** — `gate:parity` diffs 1,020
observed strings against frozen evidence, so "done" is a count of zero, not an opinion, and the
model cannot satisfy it by feeling finished. **The rename-map split closes the one hole** a pure
byte-parity gate would leave: without it the only way to pass is to keep the original's cryptic
vocabulary, which fails the rubric instead, so the loop would oscillate between two unsatisfiable
gates forever; the digit guard means the escape hatch cannot be used to move a figure. **The ledger
is read before planning, not written after acting**, which is what stops the classic circle where
a model re-tries a fix it already disproved two iterations ago.

The anti-faking section names the specific cheats available in *this* task — deleting parity keys,
amending the baseline, grading one's own rubric — because a generic "don't cheat" does not bind a
model that can see exactly which file would make the red go away.
