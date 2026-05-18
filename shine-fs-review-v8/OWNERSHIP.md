# OWNERSHIP — SHINE v8.1

**Last updated:** 2026-05-17
**Version of skill governed:** 8.1
**Governance model:** Architect / Steward / Approver

---

## Roles

### Architect — Ashitosh Shinde
- Apollo Mumbai Controllership
- ashinde@apollo.com
- **Owns:** the SHINE design, the v7/v8/v8.1 invariants, the council remediation roadmap, the cross-layer pattern library, the regulatory corpus citation registry, the materiality framework, the readiness gate.
- **Mandate:** any change to an invariant rule (rules 1–20 in `SKILL.md`), any change to the finding schema, any change to the reconciler scoring formula, or any change to the readiness-gate thresholds requires Architect approval. No exceptions.

### Steward — rotating Apollo Controllership operator
- Named per quarter in the cadence section below.
- **Owns:** day-to-day operation of the skill, controller training, dashboard usability, quarterly aggregate metrics review, schema rejection investigations, reconciler over-collapse triage.
- **Mandate:** drives PRs that touch subagent prompts, reference corpus content (non-citation), dashboard rendering polish, lessons-learned additions, and SLA tuning. Steward changes do NOT require Architect sign-off unless they cross an invariant boundary.

### Approver — Apollo Controllership leadership
- Default: VP Controllership or designate.
- **Owns:** sign-off on any change that affects external deliverables (PDF formats, preparer-facing language defaults), any change that affects audit-file content, any change that crosses regulatory disclosure boundaries.
- **Mandate:** approves Steward PRs that touch external-facing output. Architect-only changes (invariants) skip Approver and route directly because they are by definition Architect-scope.

---

## Change-control gates

Every PR must clear the gate matrix below. The Steward sets the change_class on the PR; the Architect can re-class.

| change_class | Examples | Required approvals |
|---|---|---|
| `invariant` | Edit to rules 1–20 in SKILL.md, schema change, reconciler formula, readiness thresholds | Architect (sole) |
| `external` | PDF template change, preparer export language defaults, attribution footer | Steward + Approver |
| `reference-content` | New ASC matrix entry, new regulatory citation key, new reconciler pattern | Steward + Architect (review-only on patterns) |
| `subagent-prompt` | Tightening Mechanical's hidden-row protocol, adding a Narrative grammar rule | Steward (sole, with Architect notified if rejection-rate flag fires) |
| `polish` | Typo, formatting, dashboard CSS, lessons-learned addition | Steward (sole) |
| `governance` | OWNERSHIP.md, cadence, role rotations | Architect + Approver |

Each PR title must carry the `[class]` prefix, e.g., `[reference-content] Add ASC 815-10-50-4D derivative netting trigger`.

---

## Versioning policy

- **Major (X.0):** architectural decomposition, invariant addition/removal. Architect-driven. Council review mandatory.
- **Minor (X.Y):** new layers, new patterns, new subagents, new corpus jurisdictions. Architect approval; Steward implementation.
- **Patch (X.Y.Z):** prompt tightening, polish, lessons. Steward.

Version stamps on every finding (`subagent_version`, `prompt_version`, `reference_versions`) MUST advance whenever a Steward ships a prompt or reference change. The orchestrator's `version` frontmatter advances on minor/major only.

---

## Quarterly aggregate review cadence

The Steward convenes a quarterly review covering:
- Schema rejection rate per subagent (target <5%; >5% triggers prompt re-tuning).
- Controller discard rate (target <20%; >20% on any single review triggers attestation prompts; sustained quarterly >15% triggers prompt re-tuning).
- Reconciler over-collapse incidents (any constituent decoupling action in the dashboard is logged; quarterly aggregate >2% of root causes triggers a pattern-library re-tuning sprint).
- Regulatory corpus attestation freshness (target ≤6 months per jurisdiction; any expired jurisdiction blocks READY on affected reviews and triggers a corpus refresh PR).
- Subagent SLA performance vs target (per subagent SLA tables in each subagent SKILL.md).
- Evergreen-accepted finding population — drift detection; any evergreen finding that flips state or whose acceptance reason no longer holds is reviewed.

Review minutes land in `docs/quarterly-reviews/YYYY-QN.md`. Outcomes feed the council-review-vN.md update for the next minor release.

---

## Steward rotation

| Quarter | Steward | Backup |
|---|---|---|
| 2026-Q2 | (to be named) | (to be named) |
| 2026-Q3 | TBD | TBD |
| 2026-Q4 | TBD | TBD |

Rotation rationale: forces fresh eyes on the skill at least annually; prevents single-operator drift; ensures the Steward role is institutional, not personal.

---

## Escalation contacts

| Trigger | Notify |
|---|---|
| Invariant violation in production | Architect (ashinde@apollo.com) immediately + Approver |
| Sustained schema rejection >5% on any subagent | Architect (next business day) |
| Audit-finding linked to a SHINE miss | Architect + Approver immediately; quarterly review opens an after-action |
| Regulatory corpus drift (>6 months) | Steward (triages); Architect (if blocking READY on multiple funds) |
| Controller dispute on reconciler collapse | Steward (triages via constituent toggle); Architect (if pattern library change needed) |

---

## Attribution

Every dashboard rendering and every PDF export carries the footer:

> Architecture: Ashitosh Shinde · Apollo Mumbai Controllership · SHINE v8.1 · [build date]

This is invariant rule 19. The Steward MUST preserve this footer across all dashboard and PDF template changes. Approver sign-off required to alter the footer.

---

## License & confidentiality

SHINE is Proprietary — Internal use only. Distribution outside Apollo Controllership requires Approver sign-off. Sharing the regulatory corpus, the reconciler pattern library, or the lessons-learned outside Apollo is prohibited without explicit written approval.

---

## File history

| Date | Author | Change |
|---|---|---|
| 2026-05-17 | Architect | Initial OWNERSHIP.md for v8.1 council remediation. |
