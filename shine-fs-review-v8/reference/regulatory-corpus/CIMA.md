# CIMA — Cayman Islands Monetary Authority Regulatory Corpus

**Last attestation:** 2026-05-17
**Attestation age policy:** ≤180 days. Beyond 180 days, the orchestrator emits a degradation chip per jurisdiction and the readiness gate blocks READY for any review with Cayman-applicable scope.
**Consumed by:** `subagents/defense/SKILL.md` (L12 regulatory compliance)

This corpus is the source of truth for L12 findings citing Cayman regulatory expectations. Every Defense finding citing a CIMA key MUST quote or paraphrase the requirement and cite to a section of this file via the `regulatory_citation` field on the finding.

---

## CIMA:MFA-4 — Mutual Funds Act, Section 4 (Registration Requirements)

**Scope:** Mutual funds (open-ended), retail and Section 4(3) "private" mutual funds (≥15 investors, equity interests redeemable at the option of the holder).

**Disclosure expectations in FS:**
- Cover page or organization note: the fund is registered with CIMA under MFA Section 4(3) (or other applicable category) and identifies the registration number.
- Audited FS prepared in accordance with US GAAP, IFRS, or other CIMA-approved GAAP.
- Net asset value per share / per unit disclosed.

**SHINE detection cues (L12):**
- Cayman-domiciled open-ended fund with no MFA registration disclosure.
- Registration number absent or stale.

---

## CIMA:MFA-AUDIT — Audited FS within 6 months of FYE

**Requirement:** A regulated fund must file CIMA-audited annual FS within 6 months of fiscal year end (extension may be granted on application).

**SHINE detection cues:**
- FS draft dated >5 months after period end without explicit audit timing note (indicates risk of missing the 6-month clock — but this is a defensive observation rather than a CRITICAL finding because the controller manages the filing clock).

---

## CIMA:PFA — Private Funds Act

**Scope:** Closed-ended private funds (LP-style PE / credit / real estate funds). Effective 2020.

**Disclosure expectations in FS:**
- Organization note: registration with CIMA under PFA.
- Auditor named and locally registered with CIMA.
- Annual audit obligation acknowledged.

**SHINE detection cues:**
- Cayman closed-ended PE/credit fund with no PFA reference in the organization note when fund was launched post-2020.

---

## CIMA:RULE-AUDIT-2018 — Calculation of Asset Values

**Requirement:** Funds must have documented procedures for calculating NAV; auditor reviews NAV calculation as part of the annual audit.

**Disclosure expectations:**
- Valuation policy summary in the significant accounting policies note (typically present in any ASC 946 FS; PFA / MFA codifies the obligation).

**SHINE detection cues:**
- Cayman fund with no fair-value methodology narrative beyond ASC 820 boilerplate.

---

## CIMA:STATEMENT-GOV-2023 — Corporate Governance for Regulated Funds

**Requirement:** CIMA's Statement of Guidance on Corporate Governance (effective 2023) requires regulated funds to have a written governance framework covering (a) board composition, (b) conflicts of interest policy, (c) valuation oversight, (d) anti-money-laundering.

**Disclosure expectations:**
- Governance is often disclosed in the LPA or PPM rather than in the FS. The FS may include a related-party disclosure that ties to the governance framework.

**SHINE detection cues:**
- Defense flags this when L13 (valuation governance) and L14 (audit defense) signals suggest a thin governance note in conjunction with a Cayman-domiciled regulated fund.

---

## CIMA:AML-2020 — Anti-Money-Laundering Regulations (2020 Revision)

**Requirement:** AML compliance officer designated; ongoing transaction monitoring; record retention.

**Disclosure expectations:**
- Typically not a FS disclosure; embedded in compliance documents. The corpus entry exists for cross-reference when AML-related findings surface (e.g., a side-letter equivalent treatment narrative refers to AML obligations).

---

## Citation format

Defense subagent populates `evidence.regulatory_citation` exactly as:

```
"CIMA:MFA-4"
"CIMA:PFA"
"CIMA:RULE-AUDIT-2018"
```

The orchestrator validates the key exists in `_index.json` under the `CIMA` jurisdiction at Stage 5a.

---

## Update cadence

The Steward refreshes this file at least every 180 days. Material rule changes trigger an immediate `[reference-content]` PR. Architect reviews changes that affect the keys themselves (renames, deletions); Steward can add new keys without Architect sign-off but must update `_index.json` in the same PR.
