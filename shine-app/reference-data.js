// SHINE App — Reference data (S1-07 evidence drill-down)
// Curated subset of asc-matrices.md and regulatory-corpus/*.md, structured as
// { citation_key: { title, requirement, common_omission, default_severity, source_file } }.
// Citations from a finding's evidence are looked up here for inline popover display.

window.SHINE_REFERENCE = {
  // ───── ASC 946 — Investment Companies ─────
  'ASC 946-205-45-1': {
    title: 'Required primary statements',
    requirement: 'An investment company must present a Statement of Assets and Liabilities, Statement of Operations, Statement of Changes in Partners\' Capital, Schedule of Investments, and Financial Highlights.',
    common_omission: 'Statement of Changes presented as a note instead of a primary statement.',
    default_severity: 'CRITICAL/CERTAIN',
    source_file: 'reference/asc-matrices.md'
  },
  'ASC 946-205-45-2': {
    title: 'Statement of Cash Flows — election-out criteria',
    requirement: 'A fund may elect to not present a Statement of Cash Flows if it meets all four scope criteria of ASC 946-230-45-2.',
    common_omission: 'SOCF presented when fund could elect out (likely copy-paste from corporate template); OR SOCF absent without the four-criteria attestation.',
    default_severity: 'MEDIUM/PROBABLE',
    source_file: 'reference/asc-matrices.md'
  },
  'ASC 946-210-45-1': {
    title: 'Investments at fair value caption',
    requirement: 'The Statement of Assets and Liabilities must caption investments at fair value, with cost shown in parallel.',
    common_omission: 'Line labeled "Investments at cost" without parallel fair value column.',
    default_severity: 'CRITICAL/CERTAIN',
    source_file: 'reference/asc-matrices.md'
  },
  'ASC 946-210-50-6': {
    title: 'Schedule of Investments — >5% concentration disclosure',
    requirement: 'Each investment that exceeds 5% of net assets must be disclosed by name in the Schedule of Investments.',
    common_omission: 'Aggregated "Other investments" line >5% of NAV without name-level breakout.',
    default_severity: 'HIGH/CERTAIN',
    source_file: 'reference/asc-matrices.md'
  },
  'ASC 946-220-45-3': {
    title: 'Realized vs unrealized separation',
    requirement: 'The Statement of Operations must separately present net realized gain (loss) on investments and net change in unrealized appreciation (depreciation) on investments.',
    common_omission: 'Combined "gain/loss on investments" line without bifurcation.',
    default_severity: 'HIGH/CERTAIN',
    source_file: 'reference/asc-matrices.md'
  },
  'ASC 946-230-45-2': {
    title: 'Statement of Cash Flows — election out',
    requirement: 'An investment company may elect to not present a Statement of Cash Flows if (a) substantially all investments are highly liquid, (b) substantially all carried at fair value, (c) low debt-to-equity, (d) Statement of Changes provides certain information.',
    common_omission: 'Election made without disclosure of the four scope criteria.',
    default_severity: 'MEDIUM/PROBABLE',
    source_file: 'reference/asc-matrices.md'
  },
  'ASC 946-810-45-1': {
    title: 'Investment-company consolidation exception',
    requirement: 'An investment company does NOT consolidate the operating companies it controls — those are investments measured at fair value. Investment-company subsidiaries ARE consolidated.',
    common_omission: 'Consolidation of operating subsidiaries when the IC exception applies.',
    default_severity: 'CRITICAL/CERTAIN',
    source_file: 'reference/asc-matrices.md'
  },

  // ───── ASC 820 — Fair Value Measurement ─────
  'ASC 820-10-50-2b': {
    title: 'Fair value hierarchy — Level 1/2/3 categorization',
    requirement: 'For each class of assets/liabilities measured at fair value, disclose categorization by Level 1, Level 2, and Level 3.',
    common_omission: 'Table absent, or levels swapped vs the descriptive narrative.',
    default_severity: 'CRITICAL/CERTAIN',
    source_file: 'reference/asc-matrices.md'
  },
  'ASC 820-10-50-2c': {
    title: 'Level 3 reconciliation roll-forward',
    requirement: 'A reconciliation of opening to closing balances of Level 3 measurements, disclosing purchases, sales, settlements, issuances, transfers in/out, realized gain/loss, and unrealized gain/loss separately.',
    common_omission: 'Opening/closing balances present but no purchases/sales/transfers/realized/unrealized columns; OR ending balance does not tie to SOI Level 3 footing.',
    default_severity: 'CRITICAL/CERTAIN',
    source_file: 'reference/asc-matrices.md'
  },
  'ASC 820-10-50-2d': {
    title: 'Still-held subset of realized/unrealized',
    requirement: 'Within the Level 3 reconciliation, disclose realized and unrealized gain/loss on assets still held at the reporting date.',
    common_omission: 'Total realized/unrealized disclosed but not the still-held subset.',
    default_severity: 'HIGH/PROBABLE',
    source_file: 'reference/asc-matrices.md'
  },
  'ASC 820-10-50-2f': {
    title: 'Significant unobservable inputs (Level 3) — quantitative',
    requirement: 'Quantitative disclosure of significant unobservable inputs used in Level 3 fair value measurements, including valuation technique, input, range, and weighted average.',
    common_omission: 'Qualitative description provided but no range/weighted-average table; OR table missing valuation technique column.',
    default_severity: 'CRITICAL/CERTAIN',
    source_file: 'reference/asc-matrices.md'
  },
  'ASC 820-10-50-6A': {
    title: 'Investments measured at NAV practical expedient',
    requirement: 'For investments measured using NAV practical expedient, disclose redemption restrictions, unfunded commitments, and redemption notice period.',
    common_omission: 'NAV-PE used but redemption mechanics not disclosed.',
    default_severity: 'HIGH/CERTAIN',
    source_file: 'reference/asc-matrices.md'
  },

  // ───── ASC 815 — Derivatives ─────
  'ASC 815-10-50-1A': {
    title: 'Volume of derivative activity',
    requirement: 'Tabular disclosure of volume of derivative activity (notional or fair value by category).',
    common_omission: 'Derivatives on BS or SOI but no volume table.',
    default_severity: 'HIGH/CERTAIN',
    source_file: 'reference/asc-matrices.md'
  },
  'ASC 815-10-50-4D': {
    title: 'Derivative netting / offsetting disclosure',
    requirement: 'For derivatives netted on the BS, present a reconciliation of gross to net per ASU 2011-11 / ASC 210-20-50.',
    common_omission: 'Derivatives netted on BS but no reconciliation.',
    default_severity: 'HIGH/PROBABLE',
    source_file: 'reference/asc-matrices.md'
  },

  // ───── ASC 855 / 205-40 ─────
  'ASC 855-10-50-4': {
    title: 'Subsequent events evaluation date',
    requirement: 'Disclose the date through which subsequent events have been evaluated.',
    common_omission: 'Date missing, or earlier than the expected issuance date.',
    default_severity: 'MEDIUM/CERTAIN',
    source_file: 'reference/asc-matrices.md'
  },
  'ASC 205-40-50-1': {
    title: 'Going-concern substantial doubt assessment',
    requirement: 'Management must evaluate whether conditions and events raise substantial doubt about the entity\'s ability to continue as a going concern within one year of issuance.',
    common_omission: 'Fund in wind-down, term expired, or successive losses with no going-concern note.',
    default_severity: 'HIGH/CERTAIN',
    source_file: 'reference/asc-matrices.md'
  },

  // ───── ASC 105 — ASUs in current cycle ─────
  'ASC 105-10-65': {
    title: 'Recently issued accounting standards',
    requirement: 'Disclose effective date and expected effect of issued-but-not-yet-effective ASUs that may apply.',
    common_omission: 'Boilerplate "the Fund is evaluating" without applicability assessment.',
    default_severity: 'MEDIUM/PROBABLE',
    source_file: 'reference/asc-matrices.md'
  },

  // ───── CIMA — Cayman Islands Monetary Authority ─────
  'CIMA:MFA-4': {
    title: 'Mutual Funds Act, Section 4 — registration',
    requirement: 'Cayman open-ended mutual funds with ≥15 investors and redeemable interests must register with CIMA and disclose registration in the FS.',
    common_omission: 'Cayman-domiciled open-ended fund with no MFA registration disclosure.',
    default_severity: 'MEDIUM/CERTAIN',
    source_file: 'reference/regulatory-corpus/CIMA.md'
  },
  'CIMA:MFA-AUDIT': {
    title: 'Audited FS within 6 months of FYE',
    requirement: 'CIMA-regulated funds must file CIMA-audited annual FS within 6 months of fiscal year end.',
    common_omission: 'FS draft dated >5 months after period end without explicit audit timing note.',
    default_severity: 'MEDIUM/POSSIBLE',
    source_file: 'reference/regulatory-corpus/CIMA.md'
  },
  'CIMA:PFA': {
    title: 'Private Funds Act registration',
    requirement: 'Cayman closed-ended private funds (post-2020) must register under PFA; registration disclosed in Organization note.',
    common_omission: 'Cayman closed-ended PE/credit fund with no PFA reference.',
    default_severity: 'MEDIUM/CERTAIN',
    source_file: 'reference/regulatory-corpus/CIMA.md'
  },

  // ───── SEC ─────
  'SEC:RULE-206-4-2': {
    title: 'Custody Rule (Rule 206(4)-2)',
    requirement: 'Funds advised by SEC-registered advisers with custody must be audited by a PCAOB-registered, PCAOB-inspected accountant and audited FS delivered within 120 days of FYE (180 days for fund-of-funds).',
    common_omission: 'Non-PCAOB-registered auditor; or fund-of-funds disclosure framework absent.',
    default_severity: 'HIGH/CERTAIN',
    source_file: 'reference/regulatory-corpus/SEC.md'
  },
  'SEC:FORM-PF': {
    title: 'Form PF — private fund adviser reporting',
    requirement: 'SEC-registered advisers with ≥$150M private fund AUM file Form PF; FS classification should align with Form PF designations (e.g., hedge fund vs private equity fund).',
    common_omission: 'FS uses fund-type label inconsistent with adviser\'s Form PF classification.',
    default_severity: 'MEDIUM/POSSIBLE',
    source_file: 'reference/regulatory-corpus/SEC.md'
  },

  // ───── IRS ─────
  'IRS:PFIC': {
    title: 'PFIC rules — IRC §1297–1298',
    requirement: 'Non-US corporate investments held by US investors may be PFICs; disclose presence and treatment (mark-to-market, QEF, or default §1291).',
    common_omission: 'Fund\'s SOI shows non-US corporate investments and income-tax note says "no UTPs" without addressing PFIC.',
    default_severity: 'HIGH/PROBABLE',
    source_file: 'reference/regulatory-corpus/IRS.md'
  },
  'IRS:UBTI': {
    title: 'Unrelated Business Taxable Income — IRC §511–514',
    requirement: 'Tax-exempt US investors (pension funds, endowments, IRAs) are subject to UBTI on unrelated business income; blocker structures often shield UBTI.',
    common_omission: 'AIV/blocker structures present in consolidation memo and income-tax note does not address UBTI rationale.',
    default_severity: 'HIGH/PROBABLE',
    source_file: 'reference/regulatory-corpus/IRS.md'
  },

  // ───── Delaware ─────
  'DE:DRULPA-17-1101': {
    title: 'DRULPA §17-1101 — contractual nature; permitted fiduciary modifications',
    requirement: 'Delaware LP agreements may expand, restrict, or eliminate fiduciary duties (but NOT the implied covenant of good faith and fair dealing).',
    common_omission: 'Related-party note references GP fiduciary modifications without citing the LPA or statutory basis.',
    default_severity: 'MEDIUM/PROBABLE',
    source_file: 'reference/regulatory-corpus/DELAWARE.md'
  }
};
