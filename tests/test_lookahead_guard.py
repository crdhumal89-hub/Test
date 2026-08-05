"""The look-ahead guard, and the audit trail's provenance requirements.

Definition of Done item 6 requires proof that no figure whose publication date is
later than the as-of date enters any screen result. The proof here is structural: the
guard runs in StrategyResult.__post_init__, so a result carrying a late figure cannot
be constructed at all. These tests exercise that from both directions — a late figure
must raise, and a compliant one must not.

The Figure objects below are constructed by hand. They are not market data and no
screen consumes them; they exist to drive the guard through its branches, which is
the only way to prove a guard rejects.
"""

from __future__ import annotations

from datetime import date
from fractions import Fraction

import pytest

from app.audit import (
    Criterion,
    Figure,
    LookAheadError,
    ProvenanceError,
    ScreenRun,
    ShortlistRow,
    StrategyResult,
    tag_as_proxy,
)

AS_OF = date(2026, 3, 31)


def figure(
    name: str = "ncav",
    *,
    period_end: date = date(2025, 9, 30),
    published_on: date = date(2025, 11, 14),
    value: Fraction | None = None,
) -> Figure:
    return Figure(
        name=name,
        value=value if value is not None else Fraction(3, 5),
        period_end=period_end,
        published_on=published_on,
        source="test-fixture",
    )


def criterion(*figures: Figure, passed: bool = True) -> Criterion:
    return Criterion(
        name="market cap below two thirds of NCAV",
        passed=passed,
        threshold="market cap < 2/3 x NCAV",
        figures=figures or (figure(),),
        spec_reference="strategies.md:10",
    )


def result(*rows: ShortlistRow, as_of: date = AS_OF, **kwargs) -> StrategyResult:
    return StrategyResult(
        strategy_name="Deep Value (Graham Net-Net)",
        spec_reference="strategies.md:9-11",
        as_of=as_of,
        rows=rows,
        **kwargs,
    )


def row(*criteria: Criterion, symbol: str = "TESTCO") -> ShortlistRow:
    return ShortlistRow(
        symbol=symbol,
        company_name="Test Company Ltd",
        criteria=criteria or (criterion(),),
    )


# ---------------------------------------------------------------------------
# The guard
# ---------------------------------------------------------------------------


def test_figure_published_after_as_of_cannot_enter_a_result() -> None:
    late = figure(published_on=date(2026, 5, 15))
    with pytest.raises(LookAheadError) as excinfo:
        result(row(criterion(late)))
    assert "look-ahead bias" in str(excinfo.value)
    assert "2026-05-15" in str(excinfo.value)


def test_figure_published_exactly_on_the_as_of_date_is_allowed() -> None:
    """The boundary is inclusive: published on the as-of date was public that day."""
    on_the_day = figure(period_end=date(2025, 12, 31), published_on=AS_OF)
    assert result(row(criterion(on_the_day))).rows[0].figures[0].published_on == AS_OF


def test_guard_inspects_every_figure_not_merely_the_first() -> None:
    """A late figure buried behind compliant ones must still be caught."""
    late = figure(name="current_ratio", published_on=date(2026, 4, 1))
    with pytest.raises(LookAheadError) as excinfo:
        result(row(criterion(figure(), figure(name="pb"), late)))
    assert "current_ratio" in str(excinfo.value)


def test_guard_inspects_every_row_not_merely_the_first() -> None:
    late = figure(published_on=date(2026, 4, 1))
    with pytest.raises(LookAheadError) as excinfo:
        result(
            row(symbol="CLEANCO"),
            row(criterion(late), symbol="LATECO"),
        )
    assert "LATECO" in str(excinfo.value)


def test_guard_cannot_be_bypassed_by_constructing_the_result_directly() -> None:
    """There is no unguarded construction path.

    If the guard were a separate pass, a caller could assemble a result without
    running it. Because it lives in __post_init__, every StrategyResult that exists
    has passed it.
    """
    late = figure(published_on=date(2026, 12, 31))
    with pytest.raises(LookAheadError):
        StrategyResult(
            strategy_name="Coffee Can",
            spec_reference="strategies.md:33-35",
            as_of=AS_OF,
            rows=(row(criterion(late)),),
        )


def test_a_figure_cannot_be_published_before_its_period_ends() -> None:
    """Guards the other direction: a filing date earlier than the period it reports."""
    with pytest.raises(ProvenanceError) as excinfo:
        Figure(
            name="revenue",
            value=Fraction(100),
            period_end=date(2026, 3, 31),
            published_on=date(2025, 12, 1),
            source="test-fixture",
        )
    assert "cannot be published before" in str(excinfo.value)


def test_screen_run_rejects_a_result_screened_for_a_different_date() -> None:
    with pytest.raises(ProvenanceError):
        ScreenRun(as_of=AS_OF, results=(result(row(), as_of=date(2026, 1, 31)),))


# ---------------------------------------------------------------------------
# Provenance the audit trail requires
# ---------------------------------------------------------------------------


def test_figure_requires_a_source() -> None:
    with pytest.raises(ProvenanceError, match="no source"):
        Figure(
            name="ncav",
            value=Fraction(1),
            period_end=date(2025, 9, 30),
            published_on=date(2025, 11, 14),
            source="   ",
        )


def test_criterion_requires_at_least_one_figure() -> None:
    with pytest.raises(ProvenanceError, match="no figures"):
        Criterion(
            name="unsupported",
            passed=True,
            threshold="x > y",
            figures=(),
            spec_reference="strategies.md:10",
        )


def test_criterion_requires_a_spec_reference() -> None:
    with pytest.raises(ProvenanceError, match="cite the spec"):
        Criterion(
            name="untraceable",
            passed=True,
            threshold="x > y",
            figures=(figure(),),
            spec_reference="",
        )


def test_shortlisted_row_requires_criteria() -> None:
    with pytest.raises(ProvenanceError, match="no criteria"):
        ShortlistRow(symbol="TESTCO", company_name="Test Company Ltd", criteria=())


def test_empty_result_requires_a_reason() -> None:
    with pytest.raises(ProvenanceError, match="must say why it is empty"):
        result()


def test_empty_result_with_a_reason_is_valid_and_stays_empty() -> None:
    """Zero candidates is an outcome, not a failure to be widened away."""
    empty = result(empty_reason="No company traded below 2/3 x NCAV.", universe_size=1843)
    assert empty.is_empty
    assert empty.to_dict()["empty_reason"] == "No company traded below 2/3 x NCAV."
    assert empty.to_dict()["universe_size"] == 1843


# ---------------------------------------------------------------------------
# Fallback proxies must be tagged and must disclose their component count
# ---------------------------------------------------------------------------


def test_proxy_figure_must_disclose_a_component_count() -> None:
    with pytest.raises(ProvenanceError, match="how many components"):
        Figure(
            name="pb_proxy",
            value=Fraction(2, 5),
            period_end=date(2025, 9, 30),
            published_on=date(2025, 11, 14),
            source="test-fixture",
            proxy_for="ncav",
        )


def test_component_count_without_a_proxy_is_rejected() -> None:
    """A component count on a non-proxy figure would imply an estimate that is not one."""
    with pytest.raises(ProvenanceError, match="not a proxy"):
        Figure(
            name="ncav",
            value=Fraction(2, 5),
            period_end=date(2025, 9, 30),
            published_on=date(2025, 11, 14),
            source="test-fixture",
            component_count=2,
        )


def test_tagged_proxy_renders_the_estimate_tag_and_component_count() -> None:
    proxy = tag_as_proxy(figure(name="pb", value=Fraction(2, 5)), "ncav", 2)
    assert proxy.is_proxy
    assert proxy.display == "0.4 [E] (2 components)"
    record = proxy.to_dict()
    assert record["estimate_tag"] == "[E]"
    assert record["component_count"] == 2
    assert record["proxy_for"] == "ncav"


def test_untagged_figure_carries_no_estimate_marking() -> None:
    plain = figure(value=Fraction(3, 5))
    assert plain.display == "0.6"
    assert "estimate_tag" not in plain.to_dict()
    assert "component_count" not in plain.to_dict()
