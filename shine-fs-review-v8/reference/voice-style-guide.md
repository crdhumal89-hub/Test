# Voice Style Guide — Annotation, Not Rewrite

**Version:** 8.1.0
**Consumed by:** orchestrator Stage 5g (voice annotation)
**v8.1 change:** This file replaces "voice normalization" (v8.0 rewrite-in-place). The orchestrator no longer overwrites subagent text. It annotates by populating `voiceNormalized` when a polish is warranted; otherwise leaves `voiceNormalized: null`.

---

## The controller voice (target register)

A finding written in the controller voice reads like a controllership memo to the preparer:

- Direct, indicative mood when the issue is CERTAIN.
- Concise — one to three sentences for the finding, one to two for the fix.
- Cites the line item, the statement, and (where applicable) the ASC paragraph or regulatory key.
- Names the asked-for remediation; does not editorialize.
- No throat-clearing ("It appears that…", "It is possible that…") on CERTAIN findings.
- Preserves epistemic hedging ("appears", "likely", "warrants confirmation") on PROBABLE and POSSIBLE — that hedging is faithful to the confidence label and removing it would misrepresent the subagent.

---

## Annotation decision tree

For each finding, run the orchestrator decision in this order:

1. **Is the finding text already in the controller voice?** Apply the diagnostic checklist below. If yes → leave `voiceNormalized = null`. Same for `fix`.

2. **Is the confidence CERTAIN and the text hedged?** If yes → polish: strip the hedging, keep the substance. Populate `voiceNormalized`.

3. **Is the confidence PROBABLE or POSSIBLE?** Preserve the hedging. Polish only obvious clean-ups (typos, awkward word order). If no clean-up needed → `voiceNormalized = null`. If polish applied → populate `voiceNormalized`.

4. **Is the text egregiously off-register** (e.g., conversational, includes a system reminder leak, includes a model-identifier reference, includes a meta-comment about the review process)? → polish to register AND log to `outputs/voice-polish-anomaly.log` so the Steward can flag the subagent at quarterly review.

The original `subagentRaw` is NEVER overwritten. The same logic applies to `fix` via `fixSubagentRaw` → `fixVoiceNormalized`.

---

## "Already clean" diagnostic checklist

A finding is "already clean" if all of the following hold:

- Starts with the issue, not a meta-statement ("The Level 3 reconciliation…" not "Looking at the Level 3 reconciliation…").
- Uses indicative or subjunctive aligned with the confidence label.
- Cites the line item or paragraph where applicable.
- Has no filler ("just", "really", "kind of", "essentially") — these are register breaks.
- Has no first-person ("I noticed…") — the subagent voice is institutional.
- Has no model-identifier or meta-process references.

If even one is off, consider polishing. If three or more are off, definitely polish.

---

## Polish patterns (CERTAIN findings)

| Before (hedged) | After (controller voice) |
|---|---|
| "It appears that the Level 3 reconciliation may not foot to the Schedule of Investments." | "The Level 3 reconciliation does not foot to the Schedule of Investments Level 3 subtotal." |
| "I noticed that the fund's cover page might have a different domicile than the metadata." | "Cover page domicile (Delaware) does not match fund metadata (Cayman Islands)." |
| "It seems like there could possibly be a missing subsequent-events date." | "Subsequent-events date is absent. ASC 855-10-50-4 requires it." |

Note: each polish removes hedging only. The substance, the line item, and the paragraph reference are preserved exactly.

---

## Preserve patterns (PROBABLE / POSSIBLE)

| Before | After |
|---|---|
| "It appears the side-pocket capital roll-forward may be inconsistent with the SOI side-pocket designation; warrants confirmation." | (no polish — hedging is faithful to PROBABLE; `voiceNormalized: null`) |
| "There may be an undisclosed credit-risk-related contingent feature on the ISDA agreements; controller should confirm with counterparty docs." | (no polish — POSSIBLE; `voiceNormalized: null`) |

If the only issue is a typo or word-order awkwardness, polish minimally:

| Before | After |
|---|---|
| "The cover page domiclie possibly does not match the metadata; warrants check." | "The cover page domicile possibly does not match the metadata; warrants check." |

---

## Anti-patterns (NEVER do)

- **Never** strip the line item, paragraph reference, or quoted text from a finding during polish.
- **Never** add information not in the original (no "creative" rewrites).
- **Never** rewrite a POSSIBLE finding into CERTAIN-sounding prose. The confidence label and the prose must agree.
- **Never** insert a model identifier, framework version, or meta-process commentary into the polished text.
- **Never** polish the controller's own edits (`controllerEdited`). Those are immutable controller-voice already.

---

## Threshold flag

If a subagent CONSISTENTLY produces text that needs polishing on more than 30% of its findings within a single review, the orchestrator flags the subagent for prompt-tuning at end of run. The flag lands in `outputs/coverage-manifest.json` and is summarized in the CFO summary block. Quarterly aggregate (per `OWNERSHIP.md`) reviews these flags.

---

## Why annotation, not rewrite (v8.1 design note)

The v8.0 "voice normalization" pass had two issues the council surfaced:

1. **Audit reproducibility.** When the orchestrator overwrote subagent text in-place, the chain of authorship was lost. A reviewer could not see whether the controller was reading the subagent's words or a downstream paraphrase.
2. **Confidence-label drift.** Polish frequently stripped hedging from PROBABLE/POSSIBLE findings, which made every finding read CERTAIN regardless of label.

v8.1 fixes both: the original is immutable; the polish is optional, attributed, and side-by-side viewable on the dashboard.
