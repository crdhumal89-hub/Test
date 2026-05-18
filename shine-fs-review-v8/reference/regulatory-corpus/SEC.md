# SEC — U.S. Securities and Exchange Commission Regulatory Corpus

**Last attestation:** 2026-05-17
**Attestation age policy:** ≤180 days.
**Consumed by:** `subagents/defense/SKILL.md` (L12 regulatory compliance)

US regulatory expectations applicable to funds advised by SEC-registered investment advisers.

---

## SEC:RULE-206-4-2 — Custody Rule

**Scope:** Investment advisers registered under the Advisers Act with custody (including funds where the adviser or related person serves as GP/manager).

**Requirement / FS disclosure expectations:**
- Annual audit by a PCAOB-registered, PCAOB-inspected independent public accountant.
- Audit completed and distributed to investors within 120 days of fiscal year end (180 days for funds-of-funds).
- Auditor's report covers the fund's financial statements; the GAAP framework must be US GAAP or other framework appropriate to fund type.
- Funds relying on the "audit exception" must satisfy these timing and qualifications.

**SHINE detection cues (L12):**
- FS draft references a non-PCAOB-registered auditor (rare but flag-able).
- Period end date and draft date ratio suggests post-120-day distribution risk (note: draft timing ≠ final distribution, but observation worth surfacing for Q1/Q2 reviews).
- Fund-of-funds disclosure framework absent.

---

## SEC:RULE-206-4-7 — Compliance Programs of Investment Advisers

**Scope:** SEC-registered advisers.

**Requirement:** Annually review compliance program; designate Chief Compliance Officer.

**FS disclosure expectations:** Generally not a FS disclosure. Cross-referenced for completeness in cases where governance disclosures appear in the FS notes.

---

## SEC:RULE-206-4-8 — Pooled Investment Vehicles Anti-Fraud Rule

**Scope:** Advisers to pooled investment vehicles (funds).

**Requirement:** Prohibits material misstatements or omissions to investors/prospective investors. Effectively elevates FS quality to a federal disclosure obligation.

**FS disclosure expectations:** Implicit — FS must not contain material misstatements. Used as the regulatory anchor when SHINE finds a misstatement that could reach prospective investors via a marketing piece.

---

## SEC:FORM-ADV-1A, FORM-ADV-2A

**Scope:** SEC-registered advisers.

**Cross-reference:** Form ADV disclosures (AUM, conflicts, fee structure, disciplinary) should align with FS related-party and fee disclosures. SHINE does NOT review the ADV but may flag inconsistencies when both documents are available.

---

## SEC:FORM-PF — Private Fund Adviser Reporting

**Scope:** SEC-registered advisers with ≥$150M private fund AUM.

**FS disclosure expectations:** Form PF is regulatory filing, not FS. SHINE references it when the FS draft contains classification choices (e.g., "qualifying hedge fund", "private equity fund") that should match Form PF designations.

---

## SEC:MARKETING-RULE — Rule 206(4)-1

**Scope:** SEC-registered advisers as of November 2022.

**Requirement:** Performance presentations must include net returns, comparable benchmarks, time periods, and adequate disclaimers.

**FS disclosure expectations:** Generally not a FS disclosure. Cross-reference when Financial Highlights IRR/TVPI calculations are inconsistent with marketing materials (a Defense flag worth raising with the controller though not always a FS-level error).

---

## Citation format

Defense subagent populates `evidence.regulatory_citation` exactly as:

```
"SEC:RULE-206-4-2"
"SEC:FORM-PF"
"SEC:MARKETING-RULE"
```

---

## Update cadence

The Steward refreshes this file at least every 180 days. Rule changes (e.g., the 2022 Marketing Rule, the 2023 Private Fund Adviser rule package) trigger immediate `[reference-content]` PRs. Rule rescissions or court vacaturs are noted in the corpus with effective dates so historical reviews remain interpretable.
