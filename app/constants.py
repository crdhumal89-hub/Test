"""The single place a screening threshold may appear.

Every value below is transcribed from the investment-screener specification, which
is authoritative and read-only. Where code and spec disagree, the spec wins and the
code is the defect.

Two kinds of value live here and they are deliberately not interchangeable:

  SpecValue  a number the spec states outright. It carries the spec file, the line,
             and a verbatim quote. tests/test_spec_fidelity.py re-reads the spec on
             every run and fails if the quote is no longer on that line or if the
             number is no longer in the quote, so drift cannot pass silently.

  Ruling     a number the spec does NOT state, decided by the controller because the
             spec was ambiguous or self-contradictory. It records the ambiguity, the
             decision, and the date. A Ruling never claims spec provenance.

Thresholds are Fractions rather than floats. Screening must be byte-identical across
runs for a given as-of date, and exact rational arithmetic removes the class of
ordering differences that binary rounding introduces at a boundary.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path

# The spec is read-only and lives outside the repo. Overridable so the fidelity test
# can be pointed at a copy, but never vendored in — a vendored spec can drift.
SPEC_DIR = Path(
    os.environ.get(
        "INVESTMENT_SCREENER_SPEC_DIR",
        "/root/.claude/skills/investment-screener/references",
    )
)

STRATEGIES_MD = "strategies.md"


@dataclass(frozen=True)
class SpecValue:
    """A threshold the spec states, with the evidence needed to re-verify it."""

    value: Fraction | int
    spec_file: str
    spec_line: int
    quote: str
    #: How the number is written in the quote, when that differs from repr(value).
    #: "2/3" and "≥7/9" are not what str(Fraction) produces.
    literal: str = ""
    #: True when the spec writes the number as a percentage, so that the literal in
    #: the quote is 100x the stored Fraction. The fidelity test needs to know which.
    percent: bool = False

    def __post_init__(self) -> None:
        if not self.quote:
            raise ValueError("a SpecValue must quote the spec text it came from")

    @property
    def as_written(self) -> str:
        return self.literal or str(self.value)


@dataclass(frozen=True)
class SpecFact:
    """A spec instruction that is not a number.

    Kept distinct from SpecValue so the numeric fidelity sweep is not diluted by
    entries that have no number to check. A fact is verified by its quote still being
    on its line.
    """

    spec_file: str
    spec_line: int
    quote: str

    def __post_init__(self) -> None:
        if not self.quote:
            raise ValueError("a SpecFact must quote the spec text it came from")


@dataclass(frozen=True)
class Ruling:
    """A value the spec does not supply, decided by the controller.

    Recorded separately from SpecValue so that no reader, and no test, can mistake a
    decision for a transcription.
    """

    value: Fraction | int | str
    spec_file: str
    spec_line: int
    ambiguity: str
    decision: str
    decided_on: str = "2026-08-05"
    supersedes_quote: str = ""


# ---------------------------------------------------------------------------
# Screen scope
# ---------------------------------------------------------------------------

#: Phase 1 screens as of the current date only. Controller ruling: with a current
#: universe there is no point-in-time constituent problem, so the survivorship rule
#: does not bite. Historical as-of dates are out of Phase 1 scope.
AS_OF_SCOPE = Ruling(
    value="today-only",
    spec_file=STRATEGIES_MD,
    spec_line=0,
    ambiguity=(
        "The spec does not state whether screens run for historical as-of dates. "
        "Historical dates would require point-in-time index constituents including "
        "delisted companies to avoid survivorship bias."
    ),
    decision="Phase 1 supports as-of = today only.",
)

#: Controller ruling: the population over which 'bottom quintile' and the Magic
#: Formula ranking are computed. The spec names neither.
RANKING_UNIVERSE = Ruling(
    value="all-companies-with-complete-verified-data",
    spec_file=STRATEGIES_MD,
    spec_line=17,
    ambiguity=(
        "'Low P/B (bottom quintile)' does not name the population the quintile is "
        "computed over, and the Magic Formula ranking universe is likewise unstated."
    ),
    decision=(
        "Every NSE/BSE company for which all figures a strategy requires resolve "
        "with a verified filing date. Coverage is disclosed per run."
    ),
    supersedes_quote="Low P/B (bottom quintile)",
)


# ---------------------------------------------------------------------------
# 1. Deep Value (Graham Net-Net) — strategies.md lines 9-11
# ---------------------------------------------------------------------------

DEEP_VALUE_NCAV_MULTIPLE = SpecValue(
    value=Fraction(2, 3),
    spec_file=STRATEGIES_MD,
    spec_line=10,
    quote="Market cap < 2/3 × NCAV",
    literal="2/3",
)

DEEP_VALUE_PICKS = Ruling(
    value=10,
    spec_file=STRATEGIES_MD,
    spec_line=10,
    ambiguity="'Picks: 5–10' is a range, not the single pick count the screen needs.",
    decision="Upper bound, 10, treated as the maximum reported.",
    supersedes_quote="Picks: 5–10",
)

#: Fallback proxy, authorised by the spec, usable only with the [E] tag.
DEEP_VALUE_PROXY_MAX_PB = SpecValue(
    value=Fraction(1, 2),
    spec_file=STRATEGIES_MD,
    spec_line=11,
    quote="use P/B < 0.5 with current ratio > 2 as a rough proxy",
    literal="0.5",
)

DEEP_VALUE_PROXY_MIN_CURRENT_RATIO = SpecValue(
    value=Fraction(2),
    spec_file=STRATEGIES_MD,
    spec_line=11,
    quote="use P/B < 0.5 with current ratio > 2 as a rough proxy",
    literal="2",
)

DEEP_VALUE_PROXY_COMPONENT_COUNT = 2  # P/B and current ratio


# ---------------------------------------------------------------------------
# 3. Piotroski-Enhanced Value — strategies.md lines 16-18
# ---------------------------------------------------------------------------

F_SCORE_CUTOFF = SpecValue(
    value=7,
    spec_file=STRATEGIES_MD,
    spec_line=17,
    quote="F-Score ≥7/9",
    literal="7",
)

F_SCORE_MAX = SpecValue(
    value=9,
    spec_file=STRATEGIES_MD,
    spec_line=17,
    quote="F-Score ≥7/9",
    literal="9",
)

PIOTROSKI_PICKS = SpecValue(
    value=5,
    spec_file=STRATEGIES_MD,
    spec_line=17,
    quote="Picks: 5.",
    literal="5",
)

#: The nine F-Score components, in spec order. Names are the audit-trail labels.
F_SCORE_COMPONENTS: tuple[str, ...] = (
    "positive net income",
    "positive operating CF",
    "improving ROA",
    "CF > net income",
    "declining leverage",
    "improving current ratio",
    "no dilution",
    "improving gross margin",
    "improving asset turnover",
)

#: Controller ruling. The spec's fallback formula is internally inconsistent: at 9
#: available components "score ≥ 5/(available components) × 9" yields a cutoff of 5,
#: contradicting the ≥7/9 rule one line above, and at 6 components it yields 7.5
#: against a 6-point maximum, which is unsatisfiable.
F_SCORE_FALLBACK_RULE = Ruling(
    value="ceil(7/9 * available_components)",
    spec_file=STRATEGIES_MD,
    spec_line=18,
    ambiguity=(
        "'require score ≥ 5/(available components) × 9' is self-contradictory: it "
        "loosens to 5 when all 9 components are present, and becomes unsatisfiable "
        "below 9 (at 6 components it demands 7.5 out of 6)."
    ),
    decision=(
        "Pro-rate the stated 7/9 cutoff: required = ceil(7/9 × available). At 9 this "
        "reproduces the base rule of 7; at 6 it requires 5."
    ),
    supersedes_quote="require score ≥ 5/(available components) × 9",
)


def required_f_score(available_components: int) -> int:
    """Required F-Score given how many of the nine components resolved.

    Implements F_SCORE_FALLBACK_RULE. Any result below the full component count is a
    fallback and must carry the [E] tag with the component count disclosed.
    """
    if not 1 <= available_components <= F_SCORE_MAX.value:
        raise ValueError(
            f"available components must be 1..{F_SCORE_MAX.value}, "
            f"got {available_components}"
        )
    numerator = F_SCORE_CUTOFF.value * available_components
    denominator = F_SCORE_MAX.value
    # Ceiling division, kept in integers so there is no float boundary to round.
    return -(-numerator // denominator)


# ---------------------------------------------------------------------------
# 4. Magic Formula (Greenblatt) — strategies.md lines 20-21
# ---------------------------------------------------------------------------

MAGIC_FORMULA_RANKED = Ruling(
    value=10,
    spec_file=STRATEGIES_MD,
    spec_line=21,
    ambiguity="'Picks: 10→5' gives two numbers and no rule for narrowing ten to five.",
    decision="Rank the top 10 by summed rank, then report the top 5 of those.",
    supersedes_quote="Picks: 10→5",
)

MAGIC_FORMULA_PICKS = Ruling(
    value=5,
    spec_file=STRATEGIES_MD,
    spec_line=21,
    ambiguity="'Picks: 10→5' gives two numbers and no rule for narrowing ten to five.",
    decision="Report 5, the final figure of the spec's '10→5'.",
    supersedes_quote="Picks: 10→5",
)

#: Sectors the spec excludes outright, because capital structure distorts both factors.
MAGIC_FORMULA_EXCLUDED_SECTORS: tuple[str, ...] = ("financials", "utilities")

MAGIC_FORMULA_EXCLUSION = SpecFact(
    spec_file=STRATEGIES_MD,
    spec_line=21,
    quote="Exclude financials and utilities",
)

#: Controller ruling: the spec names 'tangible capital employed' but never defines it.
TANGIBLE_CAPITAL_EMPLOYED_DEFINITION = Ruling(
    value="net_working_capital + net_fixed_assets",
    spec_file=STRATEGIES_MD,
    spec_line=21,
    ambiguity="'tangible capital employed' is undefined in the spec, yet it drives ROC.",
    decision=(
        "Greenblatt's own definition from The Little Book That Beats the Market, the "
        "source the spec line credits: net working capital + net fixed assets."
    ),
    supersedes_quote="ROC (EBIT / tangible capital employed)",
)


# ---------------------------------------------------------------------------
# 6. Quality Compounders (Buffett/Munger) — strategies.md line 31
# ---------------------------------------------------------------------------

QUALITY_MIN_ROCE = SpecValue(
    value=Fraction(15, 100),
    spec_file=STRATEGIES_MD,
    spec_line=31,
    quote="High consistent ROIC/ROCE (>15% each of last 5 years)",
    literal="15",
    percent=True,
)

QUALITY_ROCE_YEARS = SpecValue(
    value=5,
    spec_file=STRATEGIES_MD,
    spec_line=31,
    quote="High consistent ROIC/ROCE (>15% each of last 5 years)",
    literal="5",
)

QUALITY_MIN_FCF_CONVERSION = SpecValue(
    value=Fraction(80, 100),
    spec_file=STRATEGIES_MD,
    spec_line=31,
    quote="strong FCF conversion (FCF/Net Income >80%)",
    literal="80",
    percent=True,
)

QUALITY_MAX_DEBT_TO_EQUITY = SpecValue(
    value=Fraction(1, 2),
    spec_file=STRATEGIES_MD,
    spec_line=31,
    quote="conservative leverage (D/E <0.5 or net cash)",
    literal="0.5",
)

QUALITY_MIN_PROMOTER_HOLDING = SpecValue(
    value=Fraction(5, 100),
    spec_file=STRATEGIES_MD,
    spec_line=31,
    quote="management skin in the game (>5% promoter/insider holding)",
    literal="5",
    percent=True,
)

QUALITY_PICKS = SpecValue(
    value=5,
    spec_file=STRATEGIES_MD,
    spec_line=31,
    quote="Picks: 5.",
    literal="5",
)

#: Controller ruling: the spec writes 'ROIC/ROCE' without saying which. ROCE is
#: consistent with Coffee Can at line 34, which uses ROCE at the same 15% level.
QUALITY_RETURN_METRIC = Ruling(
    value="ROCE",
    spec_file=STRATEGIES_MD,
    spec_line=31,
    ambiguity=(
        "'ROIC/ROCE' names two different metrics — post-tax NOPAT on invested "
        "capital versus pre-tax EBIT on capital employed."
    ),
    decision=(
        "ROCE, matching the Coffee Can definition at line 34 so both quality "
        "strategies measure the same thing the same way."
    ),
    supersedes_quote="High consistent ROIC/ROCE",
)

#: Controller ruling: 'stable/expanding gross margins' carries no number, but every
#: criterion has to render pass or fail.
QUALITY_PRICING_POWER_RULE = Ruling(
    value="gross_margin_latest >= gross_margin_five_years_ago",
    spec_file=STRATEGIES_MD,
    spec_line=31,
    ambiguity="'stable/expanding gross margins' has no numeric definition of 'stable'.",
    decision=(
        "No net contraction across the 5-year window: latest gross margin must be at "
        "least the gross margin five years earlier. Encodes 'stable or expanding' "
        "without inventing a tolerance the spec does not contain."
    ),
    supersedes_quote="evidence of pricing power (stable/expanding gross margins)",
)


# ---------------------------------------------------------------------------
# 7. Coffee Can Portfolio — strategies.md lines 33-35
# ---------------------------------------------------------------------------

COFFEE_CAN_MIN_REVENUE_GROWTH = SpecValue(
    value=Fraction(10, 100),
    spec_file=STRATEGIES_MD,
    spec_line=34,
    quote="Revenue growth ≥10% AND ROCE ≥15% for EACH of the last 10 years",
    literal="10",
    percent=True,
)

COFFEE_CAN_MIN_ROCE = SpecValue(
    value=Fraction(15, 100),
    spec_file=STRATEGIES_MD,
    spec_line=34,
    quote="Revenue growth ≥10% AND ROCE ≥15% for EACH of the last 10 years",
    literal="15",
    percent=True,
)

COFFEE_CAN_YEARS = SpecValue(
    value=10,
    spec_file=STRATEGIES_MD,
    spec_line=34,
    quote="for EACH of the last 10 years",
    literal="10",
)

COFFEE_CAN_PICKS = SpecValue(
    value=5,
    spec_file=STRATEGIES_MD,
    spec_line=34,
    quote="Picks: 5.",
    literal="5",
)

#: Ten consecutive year-on-year growth observations need eleven years of revenue.
COFFEE_CAN_REVENUE_YEARS_REQUIRED = COFFEE_CAN_YEARS.value + 1


# ---------------------------------------------------------------------------
# PEG limit — strategies.md line 45
# ---------------------------------------------------------------------------
# The Definition of Done requires the spec-fidelity test to assert a PEG limit. PEG
# appears only in GARP (#9), which is not one of the five in-scope strategies, so this
# constant is asserted but deliberately unused by any Phase 1 screen. Logged as an
# assumption in ledger.md.

PEG_MAX = SpecValue(
    value=Fraction(1),
    spec_file=STRATEGIES_MD,
    spec_line=45,
    quote="PEG ≤1.0",
    literal="1.0",
)


# ---------------------------------------------------------------------------
# Provenance tagging
# ---------------------------------------------------------------------------

#: The tag the spec mandates on any figure derived from a fallback proxy rather than
#: from the figure the strategy actually calls for. strategies.md lines 11 and 18.
ESTIMATE_TAG = SpecFact(
    spec_file=STRATEGIES_MD,
    spec_line=11,
    quote="Tag [E]",
)

#: The same mandate is restated for the Piotroski fallback, which additionally
#: requires the component count to be disclosed alongside the tag.
ESTIMATE_TAG_WITH_COMPONENT_COUNT = SpecFact(
    spec_file=STRATEGIES_MD,
    spec_line=18,
    quote="Tag [E] with component count disclosed",
)

ESTIMATE_TAG_TEXT = "[E]"


#: Every SpecValue in this module, for the fidelity test to sweep. Kept as an explicit
#: tuple rather than discovered by introspection so that deleting a constant breaks the
#: test rather than silently shrinking its coverage.
ALL_SPEC_VALUES: tuple[tuple[str, SpecValue], ...] = (
    ("DEEP_VALUE_NCAV_MULTIPLE", DEEP_VALUE_NCAV_MULTIPLE),
    ("DEEP_VALUE_PROXY_MAX_PB", DEEP_VALUE_PROXY_MAX_PB),
    ("DEEP_VALUE_PROXY_MIN_CURRENT_RATIO", DEEP_VALUE_PROXY_MIN_CURRENT_RATIO),
    ("F_SCORE_CUTOFF", F_SCORE_CUTOFF),
    ("F_SCORE_MAX", F_SCORE_MAX),
    ("PIOTROSKI_PICKS", PIOTROSKI_PICKS),
    ("QUALITY_MIN_ROCE", QUALITY_MIN_ROCE),
    ("QUALITY_ROCE_YEARS", QUALITY_ROCE_YEARS),
    ("QUALITY_MIN_FCF_CONVERSION", QUALITY_MIN_FCF_CONVERSION),
    ("QUALITY_MAX_DEBT_TO_EQUITY", QUALITY_MAX_DEBT_TO_EQUITY),
    ("QUALITY_MIN_PROMOTER_HOLDING", QUALITY_MIN_PROMOTER_HOLDING),
    ("QUALITY_PICKS", QUALITY_PICKS),
    ("COFFEE_CAN_MIN_REVENUE_GROWTH", COFFEE_CAN_MIN_REVENUE_GROWTH),
    ("COFFEE_CAN_MIN_ROCE", COFFEE_CAN_MIN_ROCE),
    ("COFFEE_CAN_YEARS", COFFEE_CAN_YEARS),
    ("COFFEE_CAN_PICKS", COFFEE_CAN_PICKS),
    ("PEG_MAX", PEG_MAX),
)

#: Non-numeric spec instructions, verified by quote rather than by value.
ALL_SPEC_FACTS: tuple[tuple[str, SpecFact], ...] = (
    ("MAGIC_FORMULA_EXCLUSION", MAGIC_FORMULA_EXCLUSION),
    ("ESTIMATE_TAG", ESTIMATE_TAG),
    ("ESTIMATE_TAG_WITH_COMPONENT_COUNT", ESTIMATE_TAG_WITH_COMPONENT_COUNT),
)

#: Every controller Ruling, for the fidelity test to assert is disclosed rather than
#: passed off as spec text.
ALL_RULINGS: tuple[tuple[str, Ruling], ...] = (
    ("AS_OF_SCOPE", AS_OF_SCOPE),
    ("RANKING_UNIVERSE", RANKING_UNIVERSE),
    ("DEEP_VALUE_PICKS", DEEP_VALUE_PICKS),
    ("F_SCORE_FALLBACK_RULE", F_SCORE_FALLBACK_RULE),
    ("MAGIC_FORMULA_RANKED", MAGIC_FORMULA_RANKED),
    ("MAGIC_FORMULA_PICKS", MAGIC_FORMULA_PICKS),
    ("TANGIBLE_CAPITAL_EMPLOYED_DEFINITION", TANGIBLE_CAPITAL_EMPLOYED_DEFINITION),
    ("QUALITY_RETURN_METRIC", QUALITY_RETURN_METRIC),
    ("QUALITY_PRICING_POWER_RULE", QUALITY_PRICING_POWER_RULE),
)
