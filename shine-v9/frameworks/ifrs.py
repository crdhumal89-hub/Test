"""IFRS framework engine (investment entities).

Citation keys reference evidence/corpus_data/ifrs-matrices.md. The decisive
presentation difference from ASC 946: a statement of cash flows is REQUIRED
under IAS 1, with no election out.
"""
from __future__ import annotations

from frameworks.base import FrameworkEngine, derive_flags, item


class IFRS(FrameworkEngine):
    code = "IFRS"
    statement_names = {
        "balance_sheet": "Statement of Financial Position",
        "soo": "Statement of Comprehensive Income",
        "soc": "Statement of Changes in Equity",
        "scf": "Statement of Cash Flows",
        "soi": "Schedule of Investments",
        "highlights": "Financial Highlights",
        "notes": "Notes to the Financial Statements",
        "tie_out": "Tie-Out Workbook",
    }
    fs_page_order = ["balance_sheet", "soo", "soc", "scf", "soi", "notes", "highlights"]

    def required_statements(self, figures):
        return [
            {"canonical_key": "balance_sheet", "required": True, "citation_key": "IAS 1.10",
             "reason": "complete set of financial statements under IAS 1"},
            {"canonical_key": "soo", "required": True, "citation_key": "IAS 1.10",
             "reason": "complete set of financial statements under IAS 1"},
            {"canonical_key": "soc", "required": True, "citation_key": "IAS 1.10",
             "reason": "complete set of financial statements under IAS 1"},
            {"canonical_key": "scf", "required": True, "citation_key": "IAS 1.10",
             "reason": "cash flow statement is required under IAS 1 with no election out"},
        ]

    def checklist(self, figures, metadata):
        flags = derive_flags(figures)
        return [
            item("IFRS13_HIERARCHY", "standards",
                 flags["has_investments"], "fund holds investments at fair value",
                 citation_key="IFRS 13.93",
                 note_title_patterns=[r"fair value"],
                 require_text_patterns=[r"[Ll]evel\s*1", r"[Ll]evel\s*2", r"[Ll]evel\s*3"],
                 severity="CRITICAL", section="Fair value measurement",
                 message_missing="The fair value hierarchy disclosures required by IFRS 13.93 are not presented.",
                 fix="Add the IFRS 13 hierarchy disclosures: levels, transfers and techniques."),
            item("IFRS13_LEVEL3_RECON", "standards",
                 flags["has_level3"], "Level 3 investments are held",
                 citation_key="IFRS 13.93(e)",
                 note_title_patterns=[r"fair value"],
                 require_text_patterns=[r"[Ll]evel\s*3", r"reconcil|roll[\s-]?forward|opening balance"],
                 severity="CRITICAL", section="Fair value measurement",
                 message_missing="No Level 3 reconciliation is presented although Level 3 investments are held. IFRS 13.93(e) requires the opening-to-closing reconciliation.",
                 fix="Add the IFRS 13.93(e) reconciliation with all movement categories."),
            item("IFRS10_INVESTMENT_ENTITY", "standards",
                 True, "entity claims investment entity measurement",
                 citation_key="IFRS 10.27",
                 note_title_patterns=[r"polic|interests in other entities"],
                 require_text_patterns=[r"investment entity"],
                 severity="HIGH", section="Significant accounting policies",
                 message_missing="The investment entity status under IFRS 10.27, which drives fair value measurement of subsidiaries, is not disclosed.",
                 fix="State the investment entity conclusion and its basis in the accounting policies."),
            item("IFRS12_INTERESTS", "standards",
                 True, "always applicable to investment entities",
                 citation_key="IFRS 12.19",
                 note_title_patterns=[r"interests in other entities"],
                 require_text_patterns=[r"IFRS 12|interests in other"],
                 severity="HIGH", section="Interests in other entities",
                 message_missing="Disclosures of interests in other entities required by IFRS 12 are not presented.",
                 fix="Add the IFRS 12 disclosures for unconsolidated subsidiaries and structured entities."),
            item("IFRS7_RISK", "standards",
                 flags["has_investments"], "financial instruments are held",
                 citation_key="IFRS 7.31",
                 note_title_patterns=[r"risk"],
                 require_text_patterns=[r"credit risk", r"liquidity risk", r"market risk"],
                 severity="HIGH", section="Financial risk management",
                 message_missing="The nature-and-extent-of-risk disclosures required by IFRS 7.31 (credit, liquidity, market) are not presented.",
                 fix="Add the IFRS 7 risk disclosures with sensitivity analysis."),
            item("IFRS_POLICIES", "disclosure",
                 True, "always applicable",
                 citation_key=None,
                 note_title_patterns=[r"significant accounting polic"],
                 require_text_patterns=[r"fair value"],
                 severity="HIGH", section="Significant accounting policies",
                 message_missing="No significant accounting policies note describing the measurement basis is presented.",
                 fix="Add the accounting policies note."),
            item("IFRS_RELATED_PARTY", "disclosure",
                 flags["has_due_to_affiliates"], "balances due to affiliates exist",
                 citation_key=None,
                 note_title_patterns=[r"related part"],
                 require_text_patterns=[r"management fee|affiliate|general partner"],
                 severity="HIGH", section="Related party transactions",
                 message_missing="Balances due to affiliates are presented but no related party note describes the relationships, terms and amounts.",
                 fix="Add the IAS 24 related party disclosures."),
        ]
