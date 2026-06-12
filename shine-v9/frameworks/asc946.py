"""ASC 946 investment-company framework engine.

Citation keys reference the v8 authority corpus (reference/asc-matrices.md),
verified by the evidence layer before any standards finding passes.
"""
from __future__ import annotations

from frameworks.base import FrameworkEngine, derive_flags, item


class ASC946(FrameworkEngine):
    code = "ASC946"
    statement_names = {
        "balance_sheet": "Statement of Assets and Liabilities",
        "soo": "Statement of Operations",
        "soc": "Statement of Changes in Partners Capital",
        "scf": "Statement of Cash Flows",
        "soi": "Schedule of Investments",
        "highlights": "Financial Highlights",
        "notes": "Notes to Financial Statements",
        "tie_out": "Tie-Out Workbook",
    }
    fs_page_order = ["balance_sheet", "soo", "soc", "scf", "soi", "notes", "highlights"]

    def required_statements(self, figures):
        return [
            {"canonical_key": "balance_sheet", "required": True, "citation_key": "ASC 946-205-45-1",
             "reason": "primary statement under ASC 946"},
            {"canonical_key": "soo", "required": True, "citation_key": "ASC 946-205-45-1",
             "reason": "primary statement under ASC 946"},
            {"canonical_key": "soc", "required": True, "citation_key": "ASC 946-205-45-1",
             "reason": "primary statement under ASC 946"},
            {"canonical_key": "soi", "required": True, "citation_key": "ASC 946-205-45-1",
             "reason": "primary statement under ASC 946"},
            {"canonical_key": "highlights", "required": True, "citation_key": "ASC 946-205-45-1",
             "reason": "financial highlights required under ASC 946"},
            {"canonical_key": "scf", "required": False, "citation_key": "ASC 946-230-45-1",
             "reason": "elective out when the four scope criteria are met"},
        ]

    def checklist(self, figures, metadata):
        flags = derive_flags(figures)
        items = [
            item("ASC946_HIERARCHY_TABLE", "standards",
                 flags["has_investments"], "fund holds investments at fair value",
                 citation_key="ASC 820-10-50-2(b)",
                 note_title_patterns=[r"fair value"],
                 require_text_patterns=[r"[Ll]evel\s*1", r"[Ll]evel\s*2", r"[Ll]evel\s*3"],
                 severity="CRITICAL", section="Fair value measurements",
                 message_missing="The fair value hierarchy categorization (Level 1, 2, 3) is not disclosed. ASC 820-10-50-2(b) requires the leveling table for investments measured at fair value.",
                 fix="Add the three-level categorization table for all investments measured at fair value."),
            item("ASC946_LEVEL3_ROLLFORWARD", "standards",
                 flags["has_level3"], "Level 3 investments are held",
                 citation_key="ASC 820-10-50-2(c)",
                 note_title_patterns=[r"fair value"],
                 require_text_patterns=[r"[Ll]evel\s*3", r"reconcil|roll[\s-]?forward|opening balance"],
                 severity="CRITICAL", section="Fair value measurements",
                 message_missing="No Level 3 reconciliation roll-forward is disclosed although Level 3 investments are held. ASC 820-10-50-2(c) requires the full movement table.",
                 fix="Add the Level 3 roll-forward: opening balance, purchases, sales, settlements, transfers in and out, realized and unrealized gains and losses, closing balance."),
            item("ASC946_LEVEL3_INPUTS", "standards",
                 flags["has_level3"], "Level 3 investments are held",
                 citation_key="ASC 820-10-50-2(f)",
                 note_title_patterns=[r"fair value"],
                 require_text_patterns=[r"unobservable", r"range|weighted average"],
                 severity="HIGH", section="Fair value measurements",
                 message_missing="Significant unobservable inputs for Level 3 measurements are not disclosed quantitatively. ASC 820-10-50-2(f) requires technique, inputs, ranges and weighted averages.",
                 fix="Add the quantitative unobservable-inputs table with valuation technique, input, range and weighted average."),
            item("ASC946_DERIVATIVES_VOLUME", "standards",
                 flags["has_derivatives"], "derivative positions are held",
                 citation_key="ASC 815-10-50-1A",
                 note_title_patterns=[r"derivative"],
                 require_text_patterns=[r"notional|volume"],
                 severity="HIGH", section="Derivatives",
                 message_missing="Derivative positions are held but no volume disclosure (notional or fair value by category) is presented. ASC 815-10-50-1A requires it.",
                 fix="Add the derivative volume table by category."),
            item("ASC946_NAV_PE", "standards",
                 flags["has_fund_positions"], "fund interests measured at NAV practical expedient are held",
                 citation_key="ASC 820-10-50-6A",
                 note_title_patterns=[r"fair value"],
                 require_text_patterns=[r"practical expedient|net asset value"],
                 severity="HIGH", section="Fair value measurements",
                 message_missing="Fund interests are held but the NAV practical expedient disclosures (redemption restrictions, notice periods, unfunded commitments) required by ASC 820-10-50-6A are not presented.",
                 fix="Add the NAV practical expedient disclosures for each fund interest measured at NAV."),
            item("ASC946_LIQUIDATION_BASIS", "standards",
                 bool(metadata.get("liquidating", False)), "fund metadata marks the entity as liquidating",
                 citation_key="ASC 205-30-25-1",
                 note_title_patterns=[r"polic"],
                 require_text_patterns=[r"liquidation basis"],
                 severity="CRITICAL", section="Significant accounting policies",
                 message_missing="The fund is in liquidation but the statements do not disclose adoption of the liquidation basis of accounting required by ASC 205-30 when liquidation is imminent.",
                 fix="Adopt and disclose the liquidation basis: assets at expected proceeds, liabilities at expected settlement, prominent basis-change disclosure."),
            item("ASC946_ASC250_TRANSITION", "standards",
                 bool(metadata.get("policy_change_in_period", False)),
                 "fund metadata records an accounting policy change in the period",
                 citation_key="ASC 250-10-50-1",
                 note_title_patterns=[r"polic|change"],
                 require_text_patterns=[r"change in accounting|changed its method|retrospective"],
                 severity="HIGH", section="Significant accounting policies",
                 message_missing="An accounting policy change occurred in the period but the ASC 250 transition disclosures (nature, reason, method, effect) are not presented.",
                 fix="Add the ASC 250-10-50-1 disclosures for the policy change including the effect on the current period."),
            item("ASC946_SUBSEQUENT_EVENTS", "standards",
                 True, "always applicable",
                 citation_key="ASC 855-10-50-4",
                 note_title_patterns=[r"subsequent"],
                 require_text_patterns=[r"evaluated subsequent events through|evaluated through"],
                 severity="MEDIUM", section="Subsequent events",
                 message_missing="The subsequent events note does not state the date through which events were evaluated. ASC 855-10-50-4 requires it.",
                 fix="State the evaluation date in the subsequent events note."),
            item("ASC946_RELATED_PARTY", "disclosure",
                 flags["has_due_to_affiliates"], "balances due to affiliates exist",
                 citation_key=None,
                 note_title_patterns=[r"related part"],
                 require_text_patterns=[r"management fee|affiliate|general partner"],
                 severity="HIGH", section="Related party transactions",
                 message_missing="Balances due to affiliates are presented but no related party note describes the relationships, terms and amounts.",
                 fix="Add the related party note naming each relationship that generates a balance or expense, with terms and period amounts."),
            item("ASC946_RECENT_STANDARDS", "disclosure",
                 True, "always applicable",
                 citation_key=None,
                 note_title_patterns=[r"recent|accounting standards|pronouncements"],
                 require_text_patterns=[r"ASU|standard"],
                 severity="MEDIUM", section="Recently issued accounting standards",
                 message_missing="No recently-issued-accounting-standards note is presented.",
                 fix="Add the note listing adopted and pending ASUs with expected effects."),
            item("ASC946_POLICIES", "disclosure",
                 True, "always applicable",
                 citation_key=None,
                 note_title_patterns=[r"significant accounting polic"],
                 require_text_patterns=[r"fair value"],
                 severity="HIGH", section="Significant accounting policies",
                 message_missing="No significant accounting policies note describing the fair value basis of the statements is presented.",
                 fix="Add the significant accounting policies note."),
        ]
        # Aggregated positions above 5 percent of net assets violate
        # ASC 946-210-50-6 (name-level disclosure). Computable from figures.
        for name in derive_flags(figures)["aggregated_positions_over_5pct"]:
            items.append(item(
                "ASC946_CONCENTRATION_5PCT", "standards",
                True, f"aggregated position {name} exceeds 5 percent of net assets",
                citation_key="ASC 946-210-50-6",
                note_title_patterns=[], require_text_patterns=["__POSITION_AGGREGATED__"],
                severity="HIGH", section="Schedule of Investments",
                message_missing=f"The schedule aggregates {name} above 5 percent of net assets without name-level disclosure. ASC 946-210-50-6 requires each investment above 5 percent to be separately identified.",
                fix=f"Break out the constituents of {name} by name in the schedule of investments."))
        return items
