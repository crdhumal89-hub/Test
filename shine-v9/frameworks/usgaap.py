"""US GAAP framework engine (non-investment-company entities, e.g. blockers).

Citation keys reference the v8 ASC corpus plus evidence/corpus_data/
usgaap-matrices.md for topics outside the investment-company matrix.
"""
from __future__ import annotations

from frameworks.base import FrameworkEngine, derive_flags, item


class USGAAP(FrameworkEngine):
    code = "USGAAP"
    statement_names = {
        "balance_sheet": "Balance Sheet",
        "soo": "Income Statement",
        "soc": "Statement of Changes in Equity",
        "scf": "Statement of Cash Flows",
        "soi": "Schedule of Investments",
        "highlights": "Financial Highlights",
        "notes": "Notes to Financial Statements",
        "tie_out": "Tie-Out Workbook",
    }
    fs_page_order = ["balance_sheet", "soo", "soc", "scf", "soi", "notes", "highlights"]

    def required_statements(self, figures):
        return [
            {"canonical_key": "balance_sheet", "required": True, "citation_key": "ASC 230-10-15-1",
             "reason": "full presentation under US GAAP"},
            {"canonical_key": "soo", "required": True, "citation_key": "ASC 230-10-15-1",
             "reason": "full presentation under US GAAP"},
            {"canonical_key": "scf", "required": True, "citation_key": "ASC 230-10-15-1",
             "reason": "a statement of cash flows is required for a complete set of US GAAP statements"},
        ]

    def checklist(self, figures, metadata):
        flags = derive_flags(figures)
        return [
            item("USGAAP_HIERARCHY_TABLE", "standards",
                 flags["has_investments"], "investments measured at fair value are held",
                 citation_key="ASC 820-10-50-2(b)",
                 note_title_patterns=[r"fair value"],
                 require_text_patterns=[r"[Ll]evel\s*1", r"[Ll]evel\s*2", r"[Ll]evel\s*3"],
                 severity="CRITICAL", section="Fair value measurements",
                 message_missing="The fair value hierarchy categorization is not disclosed. ASC 820-10-50-2(b) requires it for assets measured at fair value.",
                 fix="Add the leveling table."),
            item("USGAAP_LEVEL3_ROLLFORWARD", "standards",
                 flags["has_level3"], "Level 3 assets are held",
                 citation_key="ASC 820-10-50-2(c)",
                 note_title_patterns=[r"fair value"],
                 require_text_patterns=[r"[Ll]evel\s*3", r"reconcil|roll[\s-]?forward|opening balance"],
                 severity="CRITICAL", section="Fair value measurements",
                 message_missing="No Level 3 reconciliation is presented although Level 3 assets are held. ASC 820-10-50-2(c) requires it.",
                 fix="Add the Level 3 roll-forward."),
            item("USGAAP_INCOME_TAXES", "standards",
                 bool(metadata.get("taxable_entity", False)), "entity is taxable",
                 citation_key="ASC 740-10-50-15",
                 note_title_patterns=[r"income tax"],
                 require_text_patterns=[r"uncertain tax|tax position"],
                 severity="HIGH", section="Income taxes",
                 message_missing="The entity is taxable but uncertain-tax-position disclosures under ASC 740-10-50-15 are not presented.",
                 fix="Add the ASC 740 disclosures."),
            item("USGAAP_RELATED_PARTY", "standards",
                 flags["has_due_to_affiliates"], "balances due to affiliates exist",
                 citation_key="ASC 850-10-50-1",
                 note_title_patterns=[r"related part"],
                 require_text_patterns=[r"management fee|affiliate|general partner"],
                 severity="HIGH", section="Related party transactions",
                 message_missing="Balances due to affiliates are presented but the ASC 850-10-50-1 related party disclosures are not.",
                 fix="Add the related party note."),
            item("USGAAP_POLICIES", "disclosure",
                 True, "always applicable",
                 citation_key=None,
                 note_title_patterns=[r"significant accounting polic"],
                 require_text_patterns=[r"fair value|basis"],
                 severity="HIGH", section="Significant accounting policies",
                 message_missing="No significant accounting policies note is presented.",
                 fix="Add the accounting policies note."),
        ]
