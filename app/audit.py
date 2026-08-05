"""The audit-trail record types, and the look-ahead guard that polices them.

Every figure a screen uses has to answer four questions before it may appear in a
result: what is the number, what period does it describe, when was it published, and
where did it come from. A figure that cannot answer all four is not usable, and this
module makes that structural rather than a matter of discipline — the types refuse to
be constructed without the answers.

The look-ahead guard is enforced at construction of a StrategyResult rather than as a
separate pass. A check that runs beside the pipeline can be forgotten; a check in the
constructor cannot be. Look-ahead bias is invisible in output that otherwise looks
correct, which is exactly why it has to be impossible to skip rather than merely
tested for.

No threshold appears in this module. Thresholds live in app/constants.py alone.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, replace
from datetime import date
from fractions import Fraction

from app.constants import ESTIMATE_TAG_TEXT


class LookAheadError(ValueError):
    """A figure published after the as-of date tried to enter a screen result."""


class ProvenanceError(ValueError):
    """A figure or row is missing provenance the audit trail requires."""


@dataclass(frozen=True)
class Figure:
    """One fetched number, with everything needed to defend it.

    ``period_end`` is the date the figure describes: the fiscal year or quarter end.
    ``published_on`` is when it became public — the filing or announcement date. These
    are months apart in India and conflating them is the look-ahead bug, so both are
    required and neither defaults.
    """

    name: str
    value: Fraction
    period_end: date
    published_on: date
    source: str
    #: Set when this figure stands in for one the strategy actually calls for, using a
    #: fallback the spec authorises. Carries the [E] tag and a component count.
    proxy_for: str | None = None
    component_count: int | None = None

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise ProvenanceError("a figure must be named")
        if not self.source.strip():
            raise ProvenanceError(f"figure {self.name!r} has no source")
        if self.published_on < self.period_end:
            raise ProvenanceError(
                f"figure {self.name!r} claims to have been published "
                f"{self.published_on} for a period ending {self.period_end}; a figure "
                f"cannot be published before the period it describes has ended"
            )
        if self.proxy_for is not None:
            if not self.proxy_for.strip():
                raise ProvenanceError(f"figure {self.name!r} has an empty proxy_for")
            if self.component_count is None or self.component_count < 1:
                raise ProvenanceError(
                    f"proxy figure {self.name!r} must disclose how many components it "
                    f"was computed from"
                )
        elif self.component_count is not None:
            raise ProvenanceError(
                f"figure {self.name!r} discloses a component count but is not a proxy; "
                f"component counts belong to fallback proxies only"
            )

    @property
    def is_proxy(self) -> bool:
        return self.proxy_for is not None

    @property
    def display(self) -> str:
        """The figure as it appears on the page, tagged if it is a proxy."""
        rendered = _render(self.value)
        if not self.is_proxy:
            return rendered
        return f"{rendered} {ESTIMATE_TAG_TEXT} ({self.component_count} components)"

    def to_dict(self) -> dict[str, object]:
        record: dict[str, object] = {
            "name": self.name,
            "value": _render(self.value),
            "period_end": self.period_end.isoformat(),
            "published_on": self.published_on.isoformat(),
            "source": self.source,
        }
        if self.is_proxy:
            record["proxy_for"] = self.proxy_for
            record["estimate_tag"] = ESTIMATE_TAG_TEXT
            record["component_count"] = self.component_count
        return record


@dataclass(frozen=True)
class Criterion:
    """One spec criterion, its verdict, and the figures that produced the verdict."""

    name: str
    passed: bool
    #: Human-readable statement of the threshold, e.g. "market cap < 2/3 x NCAV".
    threshold: str
    figures: tuple[Figure, ...]
    #: Where the threshold comes from, e.g. "strategies.md:10".
    spec_reference: str

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise ProvenanceError("a criterion must be named")
        if not self.figures:
            raise ProvenanceError(
                f"criterion {self.name!r} has no figures; a verdict with no figure "
                f"behind it is an assertion, not an audit trail"
            )
        if not self.spec_reference.strip():
            raise ProvenanceError(
                f"criterion {self.name!r} must cite the spec line it transcribes"
            )

    @property
    def uses_proxy(self) -> bool:
        return any(figure.is_proxy for figure in self.figures)

    def to_dict(self) -> dict[str, object]:
        return {
            "name": self.name,
            "passed": self.passed,
            "threshold": self.threshold,
            "spec_reference": self.spec_reference,
            "figures": [figure.to_dict() for figure in self.figures],
        }


@dataclass(frozen=True)
class ShortlistRow:
    """One shortlisted company under one strategy, with its full criterion set."""

    symbol: str
    company_name: str
    criteria: tuple[Criterion, ...]
    #: Populated by strategies that rank rather than merely filter.
    rank: int | None = None

    def __post_init__(self) -> None:
        if not self.symbol.strip():
            raise ProvenanceError("a shortlisted row must carry a symbol")
        if not self.criteria:
            raise ProvenanceError(
                f"{self.symbol} was shortlisted with no criteria recorded"
            )

    @property
    def figures(self) -> tuple[Figure, ...]:
        return tuple(f for criterion in self.criteria for f in criterion.figures)

    def to_dict(self) -> dict[str, object]:
        record: dict[str, object] = {
            "symbol": self.symbol,
            "company_name": self.company_name,
            "criteria": [criterion.to_dict() for criterion in self.criteria],
        }
        if self.rank is not None:
            record["rank"] = self.rank
        return record


@dataclass(frozen=True)
class StrategyResult:
    """What one strategy produced for one as-of date.

    Zero candidates is a legitimate, meaningful outcome — the spec says so of Deep
    Value at strategies.md:10 — so an empty result must state why rather than being
    quietly widened until names appear.
    """

    strategy_name: str
    spec_reference: str
    as_of: date
    rows: tuple[ShortlistRow, ...]
    empty_reason: str = ""
    #: How many companies the strategy could evaluate, for coverage disclosure.
    universe_size: int = 0

    def __post_init__(self) -> None:
        if not self.strategy_name.strip():
            raise ProvenanceError("a strategy result must name its strategy")
        if not self.spec_reference.strip():
            raise ProvenanceError(
                f"{self.strategy_name} must cite the spec section it transcribes"
            )
        if not self.rows and not self.empty_reason.strip():
            raise ProvenanceError(
                f"{self.strategy_name} shortlisted nobody and gave no reason; an empty "
                f"result must say why it is empty"
            )
        # The guard. Enforced here so that no result can exist having skipped it.
        for row in self.rows:
            for figure in row.figures:
                if figure.published_on > self.as_of:
                    raise LookAheadError(
                        f"{self.strategy_name}: {row.symbol} used {figure.name!r} "
                        f"published {figure.published_on}, after the as-of date "
                        f"{self.as_of}. This is look-ahead bias."
                    )

    @property
    def is_empty(self) -> bool:
        return not self.rows

    def to_dict(self) -> dict[str, object]:
        record: dict[str, object] = {
            "strategy_name": self.strategy_name,
            "spec_reference": self.spec_reference,
            "as_of": self.as_of.isoformat(),
            "universe_size": self.universe_size,
            "rows": [row.to_dict() for row in self.rows],
        }
        if self.is_empty:
            record["empty_reason"] = self.empty_reason
        return record


@dataclass(frozen=True)
class ScreenRun:
    """Every strategy's result for one as-of date — the whole screen output."""

    as_of: date
    results: tuple[StrategyResult, ...]

    def __post_init__(self) -> None:
        for result in self.results:
            if result.as_of != self.as_of:
                raise ProvenanceError(
                    f"{result.strategy_name} was screened as of {result.as_of} but the "
                    f"run is as of {self.as_of}"
                )

    def to_dict(self) -> dict[str, object]:
        return {
            "as_of": self.as_of.isoformat(),
            "results": [result.to_dict() for result in self.results],
        }

    def to_json(self) -> str:
        """Canonical serialization.

        Deterministic by construction: insertion order is fixed by the to_dict methods,
        no set or dict iteration reaches the output, separators are explicit, and every
        number is already a string. Running the same screen twice for the same as-of
        date therefore yields byte-identical bytes.
        """
        return json.dumps(
            self.to_dict(), ensure_ascii=False, separators=(",", ":"), sort_keys=True
        )


def _render(value: Fraction) -> str:
    """Render a Fraction for display and serialization, deterministically.

    Fractions keep the arithmetic exact; this is the single place they become text, so
    the same value always renders the same way regardless of how it was computed.
    """
    quantised = round(float(value), 6)
    text = f"{quantised:.6f}".rstrip("0").rstrip(".")
    return text if text not in {"", "-0"} else "0"


def tag_as_proxy(figure: Figure, proxy_for: str, component_count: int) -> Figure:
    """Mark a figure as a spec-authorised fallback proxy.

    The only supported way to create a proxy figure, so that an untagged substitution
    has to be a deliberate act rather than an omission.
    """
    return replace(figure, proxy_for=proxy_for, component_count=component_count)
