"""Running the same screen twice for the same as-of date is byte-identical.

Definition of Done item 7. The risk this guards is not that the numbers change but
that their *rendering* or *ordering* does — a set iterated somewhere, a float that
formats differently depending on how it was reached, a dict whose insertion order
follows fetch order. Any of those makes two runs disagree byte for byte while every
figure is identical, and it makes diffing two dates useless.

As with the guard tests, the records here are constructed by hand to drive the
serializer. They are not market data.
"""

from __future__ import annotations

import os
import subprocess
import sys
from datetime import date
from fractions import Fraction
from pathlib import Path

from app.audit import Criterion, Figure, ScreenRun, ShortlistRow, StrategyResult, tag_as_proxy

AS_OF = date(2026, 3, 31)


def build_run() -> ScreenRun:
    """Assemble the same screen output from scratch each call."""
    ncav = Figure(
        name="ncav",
        value=Fraction(1234567, 1000),
        period_end=date(2025, 9, 30),
        published_on=date(2025, 11, 14),
        source="fixture:balance-sheet",
    )
    market_cap = Figure(
        name="market_cap",
        value=Fraction(700000, 1000),
        period_end=date(2026, 3, 31),
        published_on=date(2026, 3, 31),
        source="fixture:quote",
    )
    proxy_pb = tag_as_proxy(
        Figure(
            name="price_to_book",
            value=Fraction(2, 5),
            period_end=date(2025, 9, 30),
            published_on=date(2025, 11, 14),
            source="fixture:balance-sheet",
        ),
        proxy_for="ncav",
        component_count=2,
    )

    shortlisted = ShortlistRow(
        symbol="TESTCO",
        company_name="Test Company Ltd",
        criteria=(
            Criterion(
                name="market cap below two thirds of NCAV",
                passed=True,
                threshold="market cap < 2/3 x NCAV",
                figures=(market_cap, ncav),
                spec_reference="strategies.md:10",
            ),
            Criterion(
                name="price to book below 0.5 (fallback proxy)",
                passed=True,
                threshold="P/B < 0.5",
                figures=(proxy_pb,),
                spec_reference="strategies.md:11",
            ),
        ),
        rank=1,
    )

    deep_value = StrategyResult(
        strategy_name="Deep Value (Graham Net-Net)",
        spec_reference="strategies.md:9-11",
        as_of=AS_OF,
        rows=(shortlisted,),
        universe_size=1843,
    )
    coffee_can = StrategyResult(
        strategy_name="Coffee Can",
        spec_reference="strategies.md:33-35",
        as_of=AS_OF,
        rows=(),
        empty_reason=(
            "No company sustained revenue growth >= 10% and ROCE >= 15% in each of "
            "the last 10 years."
        ),
        universe_size=1843,
    )
    return ScreenRun(as_of=AS_OF, results=(deep_value, coffee_can))


def test_byte_identical_across_processes_with_different_hash_seeds() -> None:
    """The strongest form of the requirement, and the only one that catches set order.

    Two runs inside one process share a hash seed, so a set or unsorted dict reaching
    the output would iterate the same way both times and the difference would hide.
    Python randomises string hashing per process, so running under two different seeds
    surfaces exactly that class of bug.
    """
    script = (
        "from tests.test_reproducibility import build_run; print(build_run().to_json())"
    )
    repo_root = Path(__file__).resolve().parent.parent

    outputs = []
    for seed in ("0", "1", "12345"):
        env = {**os.environ, "PYTHONHASHSEED": seed, "PYTHONPATH": str(repo_root)}
        completed = subprocess.run(
            [sys.executable, "-c", script],
            capture_output=True,
            text=True,
            env=env,
            cwd=repo_root,
            check=False,
        )
        assert completed.returncode == 0, completed.stderr
        outputs.append(completed.stdout)

    assert outputs[0] == outputs[1] == outputs[2], (
        "screen output differs between processes with different hash seeds; something "
        "in the pipeline iterates a set or an unordered mapping"
    )


def test_two_runs_of_the_same_screen_are_byte_identical() -> None:
    first = build_run().to_json().encode("utf-8")
    second = build_run().to_json().encode("utf-8")
    assert first == second


def test_repeated_serialization_of_one_run_is_stable() -> None:
    run = build_run()
    assert run.to_json() == run.to_json()


def test_value_rendering_does_not_depend_on_how_the_fraction_was_reached() -> None:
    """Equal values must render identically however they were computed."""
    direct = Fraction(1, 2)
    derived = Fraction(3, 6)
    reduced = Fraction(50, 100)
    rendered = {
        Figure(
            name="ratio",
            value=value,
            period_end=date(2025, 9, 30),
            published_on=date(2025, 11, 14),
            source="fixture",
        ).display
        for value in (direct, derived, reduced)
    }
    assert rendered == {"0.5"}


def test_ordering_is_preserved_not_incidental() -> None:
    """Strategy and row order come from the tuples, not from iteration chance."""
    run = build_run()
    names = [result["strategy_name"] for result in run.to_dict()["results"]]
    assert names == ["Deep Value (Graham Net-Net)", "Coffee Can"]


def test_empty_and_populated_results_both_survive_a_round_trip() -> None:
    run = build_run()
    payload = run.to_dict()
    deep_value, coffee_can = payload["results"]

    assert deep_value["rows"][0]["symbol"] == "TESTCO"
    assert "empty_reason" not in deep_value
    assert coffee_can["rows"] == []
    assert coffee_can["empty_reason"].startswith("No company sustained")
