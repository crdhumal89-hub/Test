# Prior-Review Escalation Rules

**Version:** 8.1.0
**Consumed by:** orchestrator Stage 5f
**v8.1 change:** EVERGREEN_ACCEPTED state added; takes precedence over escalation.

The orchestrator uses these rules to set `prior_review_recurrence` and (where applicable) escalate severity for current-period findings that match prior-period findings by `merge_key`. Every decision (including evergreen-skip decisions) is written to `outputs/escalation-decisions.log`.

---

## State machine

| Prior state | Evergreen on prior? | Current recurrence | Action |
|---|---|---|---|
| (no match) | — | `NEW` | No change to severity. |
| OPEN or ACCEPTED | true | `EVERGREEN_ACCEPTED` | Carry `evergreen_acceptance_reason` and `_date`. **Skip severity escalation.** Exclude from readiness-gate count. |
| OPEN or ACCEPTED | false | `RECURRING` | Escalate severity per the impact table below. |
| RESOLVED | (n/a — resolved findings are not marked evergreen) | `REGRESSED` | Escalate severity one impact tier above current. |

For prior findings that have no match in current → emit a synthetic finding with state `RESOLVED` and prior_review_recurrence `null` (synthetic-resolved) for the dashboard audit trail. Synthetic findings do NOT enter the reconciler or the readiness count.

---

## Severity escalation table — RECURRING

The escalation policy on RECURRING is: **shift confidence up one tier, and lift impact one tier if the prior finding was already at PROBABLE or CERTAIN.** Rationale: a finding that recurred is, by definition, no longer a "possible" issue — the prior review proved it; the controller's prior disposition (ACCEPTED, or unresolved OPEN) means it stuck around.

| Current severity | Prior confidence was | Escalated severity |
|---|---|---|
| LOW/POSSIBLE | POSSIBLE | LOW/PROBABLE |
| LOW/PROBABLE | PROBABLE | MEDIUM/PROBABLE |
| LOW/CERTAIN | CERTAIN | MEDIUM/CERTAIN |
| MEDIUM/POSSIBLE | POSSIBLE | MEDIUM/PROBABLE |
| MEDIUM/PROBABLE | PROBABLE | HIGH/PROBABLE |
| MEDIUM/CERTAIN | CERTAIN | HIGH/CERTAIN |
| HIGH/POSSIBLE | POSSIBLE | HIGH/PROBABLE |
| HIGH/PROBABLE | PROBABLE | CRITICAL/PROBABLE |
| HIGH/CERTAIN | CERTAIN | CRITICAL/CERTAIN |
| CRITICAL/* | * | CRITICAL/CERTAIN (cannot escalate further; the recurrence itself is a control failure signal) |

CRITICAL/CERTAIN recurrences trigger the controller-escalation channel (see SKILL.md "Controller escalation triggers").

---

## Severity escalation — REGRESSED

REGRESSED means the prior review marked the finding RESOLVED, and the current review surfaces it again. This is a stronger signal than RECURRING because someone affirmatively believed it was fixed. Escalate one impact tier above current, regardless of prior confidence.

| Current severity | Escalated severity (REGRESSED) |
|---|---|
| LOW | MEDIUM (preserve confidence) |
| MEDIUM | HIGH |
| HIGH | CRITICAL |
| CRITICAL | CRITICAL (no further headroom; flag for controller escalation) |

Every REGRESSED finding is automatically a controller-escalation trigger.

---

## Evergreen-accepted state (v8.1)

An evergreen-accepted finding is one the controller has explicitly marked as acceptable documented practice. Typical examples:
- The fund uses a presentation choice that an auditor has accepted in prior years and there is a written rationale.
- A boilerplate note (e.g., "the Fund has elected out of SOCF per ASC 946-230-45") that the subagent persistently flags because the note's brevity could look like a gap, but is in fact correct.
- A disclosure that the controller and auditor have agreed is below their materiality even though the matrix would flag it.

### Eligibility

A finding is eligible to be marked evergreen ONLY if it is LOW or MEDIUM impact. CRITICAL and HIGH cannot be evergreened — those are control gates by design.

### Effect

1. `prior_review_recurrence` is set to `EVERGREEN_ACCEPTED`.
2. Severity escalation is skipped.
3. The finding is excluded from the readiness-gate count (it does not block READY).
4. The dashboard renders a gold "Evergreen" badge with a tooltip showing the acceptance reason and date.
5. The escalation log records the evergreen skip with the original would-have-been escalation as a comment.

### Drift detection

At quarterly aggregate review (per `OWNERSHIP.md`), the Steward reviews the evergreen population:
- Has any underlying fact pattern changed (e.g., a fund moved from SOCF-elected-out to SOCF-presented)?
- Has the auditor's stance changed?
- Has materiality moved such that previously immaterial is now material?

Any flip event opens a PR to remove the evergreen mark; the finding then escalates normally on the next review.

---

## Worked examples

**Example A — RECURRING uplift.**
- Prior review: F-014 "Realized vs unrealized not bifurcated on SOO" — MEDIUM/PROBABLE, state ACCEPTED (controller agreed but didn't get it fixed).
- Current review: same merge_key fires again. Result: prior_review_recurrence = RECURRING; severity escalated to HIGH/PROBABLE.

**Example B — REGRESSED.**
- Prior review: F-008 "Subsequent-events date missing" — MEDIUM/CERTAIN, state RESOLVED.
- Current review: same merge_key fires again. Result: prior_review_recurrence = REGRESSED; severity escalated to HIGH/CERTAIN; controller-escalation triggered.

**Example C — EVERGREEN_ACCEPTED.**
- Prior review: F-022 "SOCF election-out narrative is unusually brief" — LOW/POSSIBLE, controller marked `evergreen_accepted: true` with reason "Fund elected out per ASC 946-230-45-2; brevity matches auditor's accepted prior-year language."
- Current review: same merge_key fires again. Result: prior_review_recurrence = EVERGREEN_ACCEPTED; no escalation; gold badge on dashboard.

**Example D — NEW.**
- No prior finding at same merge_key. Result: prior_review_recurrence = NEW; no escalation.

---

## Operational notes

- The orchestrator does NOT itself downgrade subagent-assigned severity. Escalation only goes up.
- A finding that the reconciler collapses into a root cause inherits the highest escalated severity among its constituents.
- Synthetic-resolved entries are emitted ONLY when `prior_review_output` is supplied. They live in `findings.json` with `state: RESOLVED` and `subagent: "orchestrator"`.
