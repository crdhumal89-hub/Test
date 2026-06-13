# Consolidation Decision Tree — ASC 946-810 / ASC 810

**Version:** 8.1.0
**Consumed by:** `subagents/comparative/SKILL.md` (L11 multi-entity consistency)

This tree drives L11 multi-entity assessments for funds with master-feeder, parallel, AIV, blocker, or rated-note-feeder structures. The Comparative subagent walks each entity in the consolidation memo through this tree and flags inconsistencies between the memo, the FS draft, and sibling-entity FS where supplied.

---

## Step 1 — Is the reporting entity an investment company under ASC 946?

Run the assessment criteria at ASC 946-10-15-4 through -15-9:

- (a) Obtains funds from investors for investment management services.
- (b) Commits to investors that its business purpose is investing for returns.
- (c) Ownership in the entity through partnership/share interests.
- (d) Pooling of funds from investors that are not related to the parent.
- (e) Investments are managed on a fair value basis.
- (f) Reports to investors on a fair value basis.

→ All criteria met: continue to Step 2.
→ One or more criteria not met: this is NOT an investment company. ASC 810 general consolidation rules apply (out of scope for SHINE; flag as a HIGH/CERTAIN finding requesting controller confirmation).

---

## Step 2 — Apply the IC exception scope (ASC 946-810-45-1 through -45-3)

The IC exception is the rule that an investment company does NOT consolidate the operating companies it controls — those are investments measured at fair value. The IC exception applies to:

- Wholly-owned and majority-owned operating-company investments.
- Controlled real-estate and infrastructure investments.

The IC exception does NOT apply to:

- Investment-company subsidiaries (where the parent IC holds an IC subsidiary).
- Wholly-owned investment partnerships that are themselves IC.

→ Operating-company subsidiaries: do not consolidate; carry at fair value in SOI.
→ IC subsidiaries: consolidate per 946-810-45-2; the consolidated FS replaces the subsidiary's standalone FS in the parent's consolidated presentation.

---

## Step 3 — Master-feeder structure

A master-feeder structure has a master fund that holds investments and one or more feeder funds that hold interests in the master.

- **Feeder FS:** typically presents the feeder's investment in the master at fair value (one line on SOAL); financial highlights are at the feeder level; expense ratios reflect feeder + a layer of master allocation.
- **Master FS:** standalone; presents investments at fair value; consolidates per Step 2.
- **Disclosure (946-810-50):** the feeder must disclose that it invests substantially all assets in the master, and present (or attach) master FS or summarize master holdings ≥5% of NAV per ASC 946-210-50-6 applied at the master level.

→ Inconsistencies SHINE looks for:
- Feeder SOI line "Investment in [Master]" present but master holdings disclosure absent.
- Feeder expense ratio and master expense ratio combined incorrectly (must reflect both layers).
- Master and feeder presentation of the same Level 3 investment inconsistent.
- Feeder financial highlights presenting master-level ratios.

---

## Step 4 — Parallel-fund structure

A parallel fund is a fund that invests alongside a main fund on a coinvestment basis. Each fund files its own FS. The funds are linked through coinvestment agreements but are not consolidated.

→ Inconsistencies SHINE looks for:
- Same portfolio investment present in multiple parallel funds at different unit-of-account fair values without rationale.
- Allocation methodology inconsistent across parallel funds (e.g., pro-rata vs round-robin) with no narrative.
- Carried interest computation differs across parallel funds when the LPA terms are uniform.

---

## Step 5 — Alternative Investment Vehicle (AIV)

An AIV is typically a side-vehicle (often Delaware LP or Cayman exempted LP) that holds specific investments — often tax-driven or to comply with investor-level constraints (ERISA, foreign jurisdictional rules).

→ For the main fund FS:
- AIV holdings are typically presented as a single line on SOI ("Investment in AIV") at fair value, OR as a look-through to the underlying investments — both are acceptable presentations per ASC 946 if disclosed.
- The fund must disclose the AIV's existence and economic purpose in the Notes.

→ Inconsistencies SHINE looks for:
- AIV present in consolidation memo but absent from FS.
- Main fund discloses AIV; sibling AIV FS (if supplied) presents inconsistent investments.
- Capital roll-forward inconsistent (main fund shows full subscription; AIV does not show the AIV-specific subset).

---

## Step 6 — Blocker corporation

A blocker corporation is typically a US C-corp (or non-US equivalent) that sits between the fund and an investment to block UBTI, ECI, or other tax exposures.

→ Tax exposure:
- The blocker corp is taxable in its own right (no IC exception on tax basis).
- The fund's investment in the blocker is carried at fair value.
- The blocker's FS (if separately issued) is taxable-entity GAAP, not IC GAAP. Sibling-entity comparison must respect this framework difference.

→ Inconsistencies SHINE looks for:
- Fund's blocker-investment fair value not consistent with the blocker's NAV after tax.
- Income-tax note in the main fund mentions blockers but the blocker DTL on outside basis differences (ASC 740-30-25-17) is undisclosed when material.

---

## Step 7 — Rated-note feeder

A rated-note feeder is a structure where institutional investors hold rated debt obligations issued by a feeder that holds limited-partner interests in the main fund. The rated notes are typically rated by NRSROs.

→ Disclosure expectations:
- Main fund FS rarely mentions the rated-note feeder unless required by ratings agency or trustee.
- Feeder FS discloses the notes structure, rating, credit features, redemption mechanics.

→ Inconsistencies SHINE looks for:
- Rated-note feeder present in consolidation memo; feeder FS does not disclose the notes structure.
- Main fund flows do not reconcile with feeder-issued notes outstanding.

---

## Output convention for L11 findings

L11 findings cite the consolidation step and the entities involved:

- `finding_class`: `inter_entity_break`
- `evidence.prior_text`: excerpt from the sibling entity FS or consolidation memo
- `evidence.quoted_text`: excerpt from the current FS draft
- `detail`: identifies the entities by name and the specific divergence (line item, ratio, classification)
- Recommend pattern 05 (Consolidation Scope Inconsistency) candidacy in the reconciler decision log when both an L11 break and an L9 ASC 946-810 finding are present.
