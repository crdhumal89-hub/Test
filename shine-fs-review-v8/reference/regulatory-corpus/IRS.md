# IRS — U.S. Internal Revenue Service Regulatory Corpus

**Last attestation:** 2026-05-17
**Attestation age policy:** ≤180 days.
**Consumed by:** `subagents/defense/SKILL.md` (L12 regulatory compliance) and `subagents/standards/SKILL.md` (cross-reference for ASC 740)

US tax regulatory expectations applicable to funds with US-source income, US taxable investors, or pass-through reporting obligations.

---

## IRS:PFIC — Passive Foreign Investment Company (IRC §1297–1298)

**Scope:** Non-US corporations held by US investors where ≥75% of gross income is passive OR ≥50% of assets produce passive income.

**FS disclosure expectations:**
- For funds with PFIC investments, the income-tax note discloses (a) presence of PFIC investments, (b) general treatment (mark-to-market under §1296 vs QEF under §1295 vs default §1291), (c) whether elections have been made on behalf of US investors.

**SHINE detection cues (L12):**
- Fund's SOI shows non-US corporate investments and the income-tax note says "no UTPs" without addressing PFIC.

---

## IRS:CFC — Controlled Foreign Corporation (IRC §951–965)

**Scope:** Non-US corporations >50% US-owned. Subjects US shareholders to Subpart F income, GILTI (§951A), §965 transition tax (legacy).

**FS disclosure expectations:** Cross-reference for ASC 740 outside-basis-differences disclosure on blocker structures. If a fund holds a controlled non-US blocker, the CFC regime affects the income-tax footnote.

**SHINE detection cues:**
- Blocker corp in consolidation memo (non-US, fund-controlled) + thin income-tax note.

---

## IRS:ECI — Effectively Connected Income (§864, §1446)

**Scope:** Non-US partners in US partnerships; certain US-trade-or-business activities.

**FS disclosure expectations:**
- Partnerships with non-US partners and US-source business income disclose ECI withholding obligations under §1446 and the related liability on SOAL where material.

**SHINE detection cues:**
- LPA-implied non-US investor base + US-trade-or-business activities (operating-company control investments) + no §1446 withholding mention.

---

## IRS:FATCA — Foreign Account Tax Compliance Act (§1471–1474)

**Scope:** Non-US funds with US investors (or non-US payors of US-source income).

**FS disclosure expectations:** Typically embedded in subscription documents, not FS notes. Cross-reference only.

---

## IRS:FORM-K-1 / K-3

**Scope:** Partnerships issuing K-1 to partners.

**FS disclosure expectations:** Not a FS disclosure per se. SHINE references it for completeness when comparing FS-level allocations to the K-1 allocation methodology (carried interest waterfall, GP allocations).

**SHINE detection cues:**
- Carried interest disclosure in FS uses a methodology that diverges from K-1 allocation language in the LPA without explanation.

---

## IRS:UBTI — Unrelated Business Taxable Income (§511–514)

**Scope:** Tax-exempt US investors (pension funds, endowments, IRAs).

**FS disclosure expectations:** Blocker structures often exist specifically to shield UBTI; the income-tax note discusses the rationale and exposure when material.

**SHINE detection cues:**
- AIV or blocker structures present in consolidation memo and income-tax note does not address UBTI.

---

## IRS:PTP — Publicly Traded Partnership (§7704)

**Scope:** Partnerships with interests "readily tradable on a secondary market". Rare for closed-end private funds; relevant for some master-feeder structures.

**FS disclosure expectations:** Cross-reference when fund's LPA permits secondary transfers that could implicate §7704 safe harbors.

---

## Citation format

```
"IRS:PFIC"
"IRS:CFC"
"IRS:FORM-K-1"
"IRS:UBTI"
```

---

## Update cadence

Tax rulings, IRS guidance, and statutory changes (e.g., GILTI rate changes, BEAT/CAMT interactions) trigger Steward updates. ASC 740-aligned disclosure expectations are coordinated with `reference/asc-matrices.md` ASC 740 entries.
