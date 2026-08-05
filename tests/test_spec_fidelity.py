"""Spec fidelity: every coded threshold must equal the threshold in the spec.

This test re-reads the authoritative specification on every run rather than trusting
a transcription made once. A screener whose thresholds have quietly drifted from its
spec produces output that looks exactly as correct as output that has not, so the
only useful check is one that reads the source of truth each time.

Definition of Done item 3 names the thresholds that must be asserted: F-Score cutoff,
NCAV multiple, ROCE level and year count, revenue-growth level and year count, FCF
conversion, leverage and PEG limits, and each strategy's pick count. Each has a named
test below in addition to the generic sweep.

If the spec cannot be read, these tests FAIL. They never skip. An unrunnable check is
a failure to fix, not a pass.
"""

from __future__ import annotations

import re
from fractions import Fraction
from pathlib import Path

import pytest

from app import constants as C

APP_DIR = Path(__file__).resolve().parent.parent / "app"


# ---------------------------------------------------------------------------
# Reading the spec
# ---------------------------------------------------------------------------


def spec_lines(filename: str) -> list[str]:
    path = C.SPEC_DIR / filename
    assert path.is_file(), (
        f"specification not readable at {path}. The spec is authoritative and the "
        f"fidelity test cannot be evaluated without it. Set "
        f"INVESTMENT_SCREENER_SPEC_DIR if it lives elsewhere."
    )
    return path.read_text(encoding="utf-8").splitlines()


def spec_line(filename: str, line_number: int) -> str:
    lines = spec_lines(filename)
    assert 1 <= line_number <= len(lines), (
        f"{filename} has {len(lines)} lines; constants reference line {line_number}"
    )
    return lines[line_number - 1]


def parse_literal(literal: str) -> Fraction:
    """Parse a number as the spec writes it: '2/3', '0.5', '15', '1.0'."""
    if "/" in literal:
        numerator, denominator = literal.split("/", 1)
        return Fraction(int(numerator), int(denominator))
    return Fraction(literal)


# ---------------------------------------------------------------------------
# Generic sweep over every SpecValue
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("name,sv", C.ALL_SPEC_VALUES, ids=[n for n, _ in C.ALL_SPEC_VALUES])
def test_spec_value_quote_is_still_on_that_spec_line(name: str, sv: C.SpecValue) -> None:
    """The quoted text must still appear, verbatim, on the line the constant cites."""
    line = spec_line(sv.spec_file, sv.spec_line)
    assert sv.quote in line, (
        f"{name} cites {sv.spec_file}:{sv.spec_line} for {sv.quote!r}, but that line "
        f"now reads:\n  {line!r}\nThe spec is authoritative: update the constant, not "
        f"the spec."
    )


@pytest.mark.parametrize("name,fact", C.ALL_SPEC_FACTS, ids=[n for n, _ in C.ALL_SPEC_FACTS])
def test_spec_fact_quote_is_still_on_that_spec_line(name: str, fact: C.SpecFact) -> None:
    """Non-numeric spec instructions are verified the same way, by quote."""
    line = spec_line(fact.spec_file, fact.spec_line)
    assert fact.quote in line, (
        f"{name} cites {fact.spec_file}:{fact.spec_line} for {fact.quote!r}, but that "
        f"line now reads:\n  {line!r}"
    )


@pytest.mark.parametrize("name,sv", C.ALL_SPEC_VALUES, ids=[n for n, _ in C.ALL_SPEC_VALUES])
def test_spec_value_number_matches_the_spec_text(name: str, sv: C.SpecValue) -> None:
    """The coded number must equal the number written in the quoted spec text."""
    assert sv.literal, f"{name} must record how the spec writes its number"
    assert sv.literal in sv.quote, (
        f"{name} claims the spec writes {sv.literal!r}, but its own quote "
        f"{sv.quote!r} does not contain it"
    )
    expected = parse_literal(sv.literal)
    if sv.percent:
        expected = expected / 100
    assert Fraction(sv.value) == expected, (
        f"{name} is coded as {sv.value} but {sv.spec_file}:{sv.spec_line} says "
        f"{sv.literal}{'%' if sv.percent else ''}"
    )


# ---------------------------------------------------------------------------
# The thresholds the Definition of Done names, each asserted by name
# ---------------------------------------------------------------------------


def test_f_score_cutoff() -> None:
    line = spec_line(C.STRATEGIES_MD, 17)
    assert "F-Score ≥7/9" in line
    assert C.F_SCORE_CUTOFF.value == 7
    assert C.F_SCORE_MAX.value == 9
    assert len(C.F_SCORE_COMPONENTS) == C.F_SCORE_MAX.value


def test_ncav_multiple() -> None:
    line = spec_line(C.STRATEGIES_MD, 10)
    assert "Market cap < 2/3 × NCAV" in line
    assert C.DEEP_VALUE_NCAV_MULTIPLE.value == Fraction(2, 3)


def test_roce_level_and_year_count() -> None:
    quality = spec_line(C.STRATEGIES_MD, 31)
    assert "(>15% each of last 5 years)" in quality
    assert C.QUALITY_MIN_ROCE.value == Fraction(15, 100)
    assert C.QUALITY_ROCE_YEARS.value == 5

    coffee_can = spec_line(C.STRATEGIES_MD, 34)
    assert "ROCE ≥15% for EACH of the last 10 years" in coffee_can
    assert C.COFFEE_CAN_MIN_ROCE.value == Fraction(15, 100)
    assert C.COFFEE_CAN_YEARS.value == 10


def test_revenue_growth_level_and_year_count() -> None:
    line = spec_line(C.STRATEGIES_MD, 34)
    assert "Revenue growth ≥10%" in line
    assert "for EACH of the last 10 years" in line
    assert C.COFFEE_CAN_MIN_REVENUE_GROWTH.value == Fraction(10, 100)
    assert C.COFFEE_CAN_YEARS.value == 10
    # Ten year-on-year growth observations need eleven years of revenue.
    assert C.COFFEE_CAN_REVENUE_YEARS_REQUIRED == 11


def test_fcf_conversion() -> None:
    line = spec_line(C.STRATEGIES_MD, 31)
    assert "FCF/Net Income >80%" in line
    assert C.QUALITY_MIN_FCF_CONVERSION.value == Fraction(80, 100)


def test_leverage_limit() -> None:
    line = spec_line(C.STRATEGIES_MD, 31)
    assert "D/E <0.5 or net cash" in line
    assert C.QUALITY_MAX_DEBT_TO_EQUITY.value == Fraction(1, 2)


def test_peg_limit() -> None:
    # PEG is stated at strategies.md:45 for GARP (#9), which is out of Phase 1 scope.
    # The Definition of Done requires it asserted, so it is carried and checked here
    # even though no in-scope strategy consumes it.
    line = spec_line(C.STRATEGIES_MD, 45)
    assert "PEG ≤1.0" in line
    assert C.PEG_MAX.value == Fraction(1)


def test_promoter_holding_limit() -> None:
    line = spec_line(C.STRATEGIES_MD, 31)
    assert ">5% promoter/insider holding" in line
    assert C.QUALITY_MIN_PROMOTER_HOLDING.value == Fraction(5, 100)


def test_deep_value_fallback_proxy_thresholds() -> None:
    line = spec_line(C.STRATEGIES_MD, 11)
    assert "P/B < 0.5 with current ratio > 2" in line
    assert "Tag [E]" in line
    assert C.DEEP_VALUE_PROXY_MAX_PB.value == Fraction(1, 2)
    assert C.DEEP_VALUE_PROXY_MIN_CURRENT_RATIO.value == Fraction(2)
    assert C.DEEP_VALUE_PROXY_COMPONENT_COUNT == 2
    assert C.ESTIMATE_TAG_TEXT == "[E]"


def test_each_strategy_pick_count() -> None:
    """All five in-scope pick counts, spec-stated or controller-ruled."""
    assert "Picks: 5–10" in spec_line(C.STRATEGIES_MD, 10)
    assert C.DEEP_VALUE_PICKS.value == 10

    assert "Picks: 5." in spec_line(C.STRATEGIES_MD, 17)
    assert C.PIOTROSKI_PICKS.value == 5

    assert "Picks: 10→5." in spec_line(C.STRATEGIES_MD, 21)
    assert C.MAGIC_FORMULA_RANKED.value == 10
    assert C.MAGIC_FORMULA_PICKS.value == 5

    assert "Picks: 5." in spec_line(C.STRATEGIES_MD, 31)
    assert C.QUALITY_PICKS.value == 5

    assert "Picks: 5." in spec_line(C.STRATEGIES_MD, 34)
    assert C.COFFEE_CAN_PICKS.value == 5


def test_magic_formula_sector_exclusions() -> None:
    line = spec_line(C.STRATEGIES_MD, 21)
    assert "Exclude financials and utilities" in line
    assert C.MAGIC_FORMULA_EXCLUDED_SECTORS == ("financials", "utilities")


# ---------------------------------------------------------------------------
# Controller rulings must be disclosed as rulings, never as spec text
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("name,ruling", C.ALL_RULINGS, ids=[n for n, _ in C.ALL_RULINGS])
def test_ruling_is_disclosed(name: str, ruling: C.Ruling) -> None:
    assert ruling.ambiguity.strip(), f"{name} must state the ambiguity it resolves"
    assert ruling.decision.strip(), f"{name} must state the decision taken"
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", ruling.decided_on), (
        f"{name} must record when it was decided"
    )


@pytest.mark.parametrize("name,ruling", C.ALL_RULINGS, ids=[n for n, _ in C.ALL_RULINGS])
def test_ruling_points_at_the_ambiguous_spec_text(name: str, ruling: C.Ruling) -> None:
    """Where a ruling supersedes specific spec wording, that wording must still exist.

    If the spec is later clarified, the quote stops matching and this fails, which is
    the signal to retire the ruling in favour of the now-stated value.
    """
    if not ruling.supersedes_quote:
        return
    line = spec_line(ruling.spec_file, ruling.spec_line)
    assert ruling.supersedes_quote in line, (
        f"{name} supersedes {ruling.supersedes_quote!r} at {ruling.spec_file}:"
        f"{ruling.spec_line}, but that line now reads:\n  {line!r}\nIf the spec has "
        f"been clarified, retire the ruling and transcribe the stated value."
    )


def test_f_score_fallback_matches_its_ruling() -> None:
    """ceil(7/9 x available), the rule the controller set for the broken spec formula."""
    assert C.required_f_score(9) == 7, "at full components it must reproduce ≥7/9"
    assert C.required_f_score(8) == 7
    assert C.required_f_score(7) == 6
    assert C.required_f_score(6) == 5  # ceil(7/9 x 6) = ceil(4.67)
    assert C.required_f_score(5) == 4
    assert C.required_f_score(1) == 1

    # Never demands more points than exist, which is the defect in the spec formula.
    for available in range(1, 10):
        assert C.required_f_score(available) <= available

    # Never loosens below the base rule when all components are present.
    assert C.required_f_score(C.F_SCORE_MAX.value) == C.F_SCORE_CUTOFF.value

    for invalid in (0, -1, 10):
        with pytest.raises(ValueError):
            C.required_f_score(invalid)


# ---------------------------------------------------------------------------
# The constants module is the ONLY place a threshold may appear
# ---------------------------------------------------------------------------


def _app_modules_except_constants() -> list[Path]:
    return sorted(
        p for p in APP_DIR.rglob("*.py") if p.name not in {"constants.py", "__init__.py"}
    )


def test_no_threshold_literal_outside_the_constants_module() -> None:
    """No other module may invent a threshold.

    Enforced structurally: thresholds are Fractions and live in constants.py, so any
    decimal literal or Fraction construction elsewhere in app/ is a threshold that
    escaped the single source of truth.
    """
    decimal_literal = re.compile(r"(?<![\w.])\d+\.\d+")
    offenders: list[str] = []

    for module in _app_modules_except_constants():
        for number, raw in enumerate(module.read_text(encoding="utf-8").splitlines(), 1):
            code = raw.split("#", 1)[0]
            if decimal_literal.search(code) or "Fraction(" in code:
                offenders.append(f"{module.relative_to(APP_DIR.parent)}:{number}: {raw.strip()}")

    assert not offenders, (
        "thresholds must come from app/constants.py alone; found numeric literals in:\n"
        + "\n".join(offenders)
    )


def test_every_spec_value_is_registered_for_sweeping() -> None:
    """A constant dropped from ALL_SPEC_VALUES would silently lose its fidelity check."""
    registered = {name for name, _ in C.ALL_SPEC_VALUES}
    defined = {
        name
        for name in dir(C)
        if name.isupper() and isinstance(getattr(C, name), C.SpecValue)
    }
    assert defined == registered, (
        f"unregistered SpecValue constants: {sorted(defined - registered)}; "
        f"registered but missing: {sorted(registered - defined)}"
    )


def test_every_spec_fact_is_registered_for_sweeping() -> None:
    registered = {name for name, _ in C.ALL_SPEC_FACTS}
    defined = {
        name for name in dir(C) if name.isupper() and isinstance(getattr(C, name), C.SpecFact)
    }
    assert defined == registered, (
        f"unregistered SpecFact constants: {sorted(defined - registered)}; "
        f"registered but missing: {sorted(registered - defined)}"
    )


def test_every_ruling_is_registered_for_sweeping() -> None:
    registered = {name for name, _ in C.ALL_RULINGS}
    defined = {
        name for name in dir(C) if name.isupper() and isinstance(getattr(C, name), C.Ruling)
    }
    assert defined == registered, (
        f"unregistered Ruling constants: {sorted(defined - registered)}; "
        f"registered but missing: {sorted(registered - defined)}"
    )
