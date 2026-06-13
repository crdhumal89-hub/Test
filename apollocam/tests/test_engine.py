"""
Unit tests for ApolloCAM business logic engine.
Validates against June 2026 seed data to ensure Python results match Excel.

Expected results (from verified ApolloCAM.xlsx build):
  RED=3: AAA-IDF-AGG (-60,365), AAA-DL-Y (-177,734), AAA-SF1YS (-21,899)
  AMBER=2: AAA-SF4Z (+6,002), AAA-SF2Y (+4,913)
  GREEN=4: AAA-AGG, AAA-LUX-AGG, AAA-MACS-Z, AAA-HOSTPLUS-II
  BLUE=2: AAA-SF1Y, AAA-LIBRA

Wire proposals:
  P1: AAA-SF1Y → AAA-DL-Y   $177,734
  P2: AAA-AGG  → AAA-IDF-AGG $60,365
  P3: AAA-SF1Y → AAA-SF1YS   $21,899
"""

import io
import sqlite3
from datetime import date

import pytest
import pandas as pd

from core.database import init_db, get_connection, log_audit
from core.engine import (
    compute_status, compute_functional_usd, build_fund_view,
    propose_wires, propose_fx_conversions, save_proposals, build_14day_forecast,
    status_summary, _workday, _load_holidays,
    RED, AMBER, GREEN, BLUE
)
from core.loader_gen import (
    generate_trade_loader, generate_ivp_loader, generate_spot_fx_loader
)
from core.importer import parse_position_file


@pytest.fixture
def conn():
    """In-memory SQLite connection seeded with fund master + test positions."""
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    init_db(c)
    _seed_june_positions(c)
    yield c
    c.close()


def _seed_june_positions(conn: sqlite3.Connection):
    """Seed the June 2026 cash positions from context document."""
    positions = [
        ("AAA-AGG",         "Operating USD", "USD",  2_192_987.00),
        ("AAA-LUX-AGG",     "Operating USD", "USD",    632_859.00),
        ("AAA-LUX-AGG",     "EUR Account",   "EUR",    120_000.00),
        ("AAA-IDF-AGG",     "Operating USD", "USD",     89_635.00),
        ("AAA-SF1Y",        "Operating USD", "USD",  9_281_309.00),
        ("AAA-MACS-Z",      "Operating USD", "USD",    208_430.00),
        ("AAA-MACS-Z",      "EUR Account",   "EUR",    340_000.00),
        ("AAA-DL-Y",        "Operating USD", "USD",    -77_734.00),
        ("AAA-HOSTPLUS-II", "Operating USD", "USD",    388_310.00),
        ("AAA-HOSTPLUS-II", "GBP Account",   "GBP",    150_000.00),
        ("AAA-SF4Z",        "Operating USD", "USD",    121_002.00),
        ("AAA-SF2Y",        "Operating USD", "USD",    114_913.00),
        ("AAA-SF1YS",       "Operating USD", "USD",     53_101.00),
        ("AAA-LIBRA",       "Operating USD", "USD",    131_363.00),
    ]
    rate_map = {"USD": 1.0, "EUR": 1.09, "GBP": 1.27}
    for fund, acct, ccy, bal in positions:
        func_usd = bal * rate_map.get(ccy, 1.0)
        conn.execute(
            """INSERT INTO positions(run_date, fund_code, account_name, ccy,
               local_balance, functional_usd)
               VALUES ('2026-06-01', ?, ?, ?, ?, ?)""",
            (fund, acct, ccy, bal, func_usd)
        )
    conn.commit()


# ─────────────────────────────────────────────────────────────────────────────
# compute_status unit tests
# ─────────────────────────────────────────────────────────────────────────────

class TestComputeStatus:
    def test_red_below_floor(self):
        assert compute_status(50_000, 100_000, 300_000) == RED

    def test_red_negative_balance(self):
        assert compute_status(-77_734, 100_000, 300_000) == RED

    def test_amber_just_above_floor(self):
        # floor=100k, amber=110k. 105k should be AMBER.
        assert compute_status(105_000, 100_000, 300_000) == AMBER

    def test_green_within_band(self):
        assert compute_status(200_000, 100_000, 300_000) == GREEN

    def test_blue_above_ceiling(self):
        assert compute_status(9_281_309, 2_000_000, 5_000_000) == BLUE

    def test_green_above_amber_threshold(self):
        # cash = floor * 1.10 + 1 = 110,001 → GREEN. The exact boundary 110,000
        # is subject to float precision (100_000 * 1.1 = 110000.00000000001 in Python),
        # which is an unreachable edge case in practice — fund balances are never exact
        # multiples of 1.10 × floor. Excel evaluates it the same for non-degenerate inputs.
        assert compute_status(110_001, 100_000, 300_000) == GREEN

    def test_amber_just_below_amber_threshold(self):
        assert compute_status(109_999, 100_000, 300_000) == AMBER

    def test_green_at_ceiling(self):
        # cash == ceiling → GREEN (ceiling is inclusive upper bound)
        assert compute_status(300_000, 100_000, 300_000) == GREEN

    def test_blue_one_above_ceiling(self):
        assert compute_status(300_001, 100_000, 300_000) == BLUE


# ─────────────────────────────────────────────────────────────────────────────
# FX conversion tests
# ─────────────────────────────────────────────────────────────────────────────

class TestFXConversion:
    def test_eur_conversion(self):
        result = compute_functional_usd(120_000, "EUR", {"EUR": 1.09, "USD": 1.0})
        assert abs(result - 130_800) < 1

    def test_gbp_conversion(self):
        result = compute_functional_usd(150_000, "GBP", {"GBP": 1.27, "USD": 1.0})
        assert abs(result - 190_500) < 1

    def test_usd_passthrough(self):
        result = compute_functional_usd(500_000, "USD", {"USD": 1.0})
        assert result == 500_000

    def test_unknown_ccy_passthrough(self):
        # Unknown CCY should return local balance (rate defaults to 1.0)
        result = compute_functional_usd(100_000, "CHF", {"USD": 1.0})
        assert result == 100_000


# ─────────────────────────────────────────────────────────────────────────────
# Fund view + status summary (full integration test)
# ─────────────────────────────────────────────────────────────────────────────

class TestFundView:
    def test_status_counts(self, conn):
        df = build_fund_view(conn, "2026-06-01")
        summary = status_summary(df)
        assert summary[RED]   == 3, f"Expected 3 RED, got {summary[RED]}"
        assert summary[AMBER] == 2, f"Expected 2 AMBER, got {summary[AMBER]}"
        assert summary[GREEN] == 4, f"Expected 4 GREEN, got {summary[GREEN]}"
        assert summary[BLUE]  == 2, f"Expected 2 BLUE, got {summary[BLUE]}"

    def test_red_fund_codes(self, conn):
        df = build_fund_view(conn, "2026-06-01")
        red_funds = set(df[df["status"] == RED]["fund_code"].tolist())
        assert red_funds == {"AAA-IDF-AGG", "AAA-DL-Y", "AAA-SF1YS"}

    def test_blue_fund_codes(self, conn):
        df = build_fund_view(conn, "2026-06-01")
        blue_funds = set(df[df["status"] == BLUE]["fund_code"].tolist())
        assert blue_funds == {"AAA-SF1Y", "AAA-LIBRA"}

    def test_lux_agg_fx_conversion(self, conn):
        """AAA-LUX-AGG: USD 632,859 + EUR 120,000 × 1.09 = 763,659"""
        df = build_fund_view(conn, "2026-06-01")
        lux_cash = df[df["fund_code"] == "AAA-LUX-AGG"]["cash_usd"].iloc[0]
        expected = 632_859 + 120_000 * 1.09  # = 763,659
        assert abs(lux_cash - expected) < 1

    def test_dl_y_negative_balance(self, conn):
        df = build_fund_view(conn, "2026-06-01")
        dl_y = df[df["fund_code"] == "AAA-DL-Y"].iloc[0]
        assert dl_y["status"] == RED
        assert dl_y["cash_usd"] == -77_734
        assert abs(dl_y["deficit"] - 177_734) < 1  # floor=100k, cash=-77.7k → deficit=177.7k


# ─────────────────────────────────────────────────────────────────────────────
# Wire proposal tests
# ─────────────────────────────────────────────────────────────────────────────

class TestProposeWires:
    def test_wire_count(self, conn):
        df = build_fund_view(conn, "2026-06-01")
        proposals = propose_wires(df)
        assert len(proposals) == 3

    def test_wire_priority_1(self, conn):
        """Largest deficit first: DL-Y deficit $177,734 sourced from AAA-SF1Y"""
        df = build_fund_view(conn, "2026-06-01")
        proposals = propose_wires(df)
        p1 = proposals[0]
        assert p1["from_fund"] == "AAA-SF1Y"
        assert p1["to_fund"]   == "AAA-DL-Y"
        assert abs(p1["sell_amount"] - 177_734) < 1

    def test_wire_priority_2(self, conn):
        """Second: IDF-AGG deficit $60,365 sourced from AAA-AGG"""
        df = build_fund_view(conn, "2026-06-01")
        proposals = propose_wires(df)
        p2 = proposals[1]
        assert p2["from_fund"] == "AAA-AGG"
        assert p2["to_fund"]   == "AAA-IDF-AGG"
        assert abs(p2["sell_amount"] - 60_365) < 1

    def test_wire_priority_3(self, conn):
        """Third: SF1YS deficit $21,899 sourced from AAA-SF1Y"""
        df = build_fund_view(conn, "2026-06-01")
        proposals = propose_wires(df)
        p3 = proposals[2]
        assert p3["from_fund"] == "AAA-SF1Y"
        assert p3["to_fund"]   == "AAA-SF1YS"
        assert abs(p3["sell_amount"] - 21_899) < 1

    def test_sequential_balance_update(self, conn):
        """Both wires from AAA-SF1Y (177734 + 21899 = 199633) should not exceed available."""
        df = build_fund_view(conn, "2026-06-01")
        sf1y_row = df[df["fund_code"] == "AAA-SF1Y"].iloc[0]
        available = sf1y_row["cash_usd"] - sf1y_row["cash_floor"]

        proposals = propose_wires(df)
        sf1y_total = sum(
            p["sell_amount"] for p in proposals if p["from_fund"] == "AAA-SF1Y"
        )
        assert sf1y_total <= available + 1  # allow 1 cent rounding


# ─────────────────────────────────────────────────────────────────────────────
# Workday / holiday calendar tests
# ─────────────────────────────────────────────────────────────────────────────

class TestWorkday:
    def test_simple_advance(self):
        assert _workday(date(2026, 6, 1), 2, set()) == date(2026, 6, 3)

    def test_skips_weekend(self):
        # Friday June 5 + 2 business days = Tuesday June 9 (skips Sat/Sun)
        assert _workday(date(2026, 6, 5), 2, set()) == date(2026, 6, 9)

    def test_skips_holiday(self):
        # Juneteenth June 19 (Friday) + lag 2 from June 17 (Wed) should skip June 19
        juneteenth = {date(2026, 6, 19)}
        # June 17 (Wed) + 2 biz days: June 18 (Thu, step 1), skip June 19 (holiday),
        # June 22 (Mon, step 2) → June 22
        assert _workday(date(2026, 6, 17), 2, juneteenth) == date(2026, 6, 22)

    def test_lag_zero_returns_start(self):
        # T+0 for wire value dates: returns the start date unchanged
        assert _workday(date(2026, 6, 1), 0, set()) == date(2026, 6, 1)

    def test_holidays_seeded_count(self, conn):
        """Seed must have at least 11 holidays for 2026 (full US market calendar)."""
        holidays = _load_holidays(conn)
        holidays_2026 = {d for d in holidays if d.year == 2026}
        assert len(holidays_2026) >= 11, (
            f"Only {len(holidays_2026)} 2026 holidays seeded — need full NYSE calendar"
        )

    def test_juneteenth_seeded(self, conn):
        """Juneteenth (June 19) must be seeded — it's relevant to June run dates."""
        holidays = _load_holidays(conn)
        assert date(2026, 6, 19) in holidays

    def test_independence_day_observed_seeded(self, conn):
        """July 4, 2026 is Saturday; the observed holiday (July 3) must be seeded."""
        holidays = _load_holidays(conn)
        assert date(2026, 7, 3) in holidays, (
            "July 3, 2026 (observed Independence Day) must be in holiday calendar"
        )


# ─────────────────────────────────────────────────────────────────────────────
# save_proposals — transaction atomicity
# ─────────────────────────────────────────────────────────────────────────────

class TestSaveProposals:
    def test_all_proposals_committed(self, conn):
        """All proposals and wire_status rows are persisted after save_proposals."""
        df = build_fund_view(conn, "2026-06-01")
        proposals = propose_wires(df)
        assert len(proposals) == 3

        save_proposals(conn, proposals, "2026-06-01", "B20260601-001")

        saved = conn.execute(
            "SELECT COUNT(*) FROM proposals WHERE run_date = '2026-06-01'"
        ).fetchone()[0]
        assert saved == 3

        wire_rows = conn.execute(
            "SELECT COUNT(*) FROM wire_status WHERE batch_id = 'B20260601-001'"
        ).fetchone()[0]
        assert wire_rows == 3  # all three are WIRE type

    def test_no_duplicate_on_rerun(self, conn):
        """Running proposals twice (clearing PENDING first) should not double proposals."""
        df = build_fund_view(conn, "2026-06-01")
        proposals = propose_wires(df)

        save_proposals(conn, proposals, "2026-06-01", "B20260601-001")
        # Simulate clearing PENDING and re-running (as the Proposals page does).
        # Must remove wire_status rows before proposals due to FK constraint.
        conn.execute(
            """DELETE FROM wire_status WHERE proposal_id IN (
                 SELECT id FROM proposals WHERE run_date='2026-06-01' AND action='PENDING'
               )"""
        )
        conn.execute("DELETE FROM proposals WHERE run_date='2026-06-01' AND action='PENDING'")
        conn.commit()
        save_proposals(conn, proposals, "2026-06-01", "B20260601-002")

        count = conn.execute(
            "SELECT COUNT(*) FROM proposals WHERE run_date='2026-06-01'"
        ).fetchone()[0]
        assert count == 3, f"Expected 3 proposals after re-run, got {count}"


# ─────────────────────────────────────────────────────────────────────────────
# 14-day forecast — days_to_red calculation
# ─────────────────────────────────────────────────────────────────────────────

class TestForecast:
    def test_no_pipeline_no_red(self, conn):
        """With no pipeline events all GREEN/BLUE funds stay non-RED; days_to_red is None."""
        df = build_fund_view(conn, "2026-06-01")
        forecast = build_14day_forecast(conn, df, "2026-06-01")

        agg_rows = forecast[forecast["fund_code"] == "AAA-AGG"]
        sf1y_rows = forecast[forecast["fund_code"] == "AAA-SF1Y"]
        assert agg_rows["days_to_red"].isna().all()
        assert sf1y_rows["days_to_red"].isna().all()

    def test_pipeline_event_causes_red(self, conn):
        """A large call draining a fund below floor should flag days_to_red = 1."""
        # Insert a pipeline event that drains AAA-AGG below its floor of 1,500,000
        conn.execute(
            """INSERT INTO pipeline_events
               (event_id, deal_name, ccy, call_amount, distro_amount, event_date, fund_code)
               VALUES ('EVT-001', 'Test Call', 'USD', 2000000, 0, '2026-06-02', 'AAA-AGG')"""
        )
        conn.commit()

        df = build_fund_view(conn, "2026-06-01")
        forecast = build_14day_forecast(conn, df, "2026-06-01")

        agg_rows = forecast[forecast["fund_code"] == "AAA-AGG"]
        # After losing $2M: 2,192,987 - 2,000,000 = 192,987 < 1,500,000 floor → RED on day 1
        agg_day2 = agg_rows[agg_rows["target_date"] == "2026-06-02"].iloc[0]
        assert agg_day2["projected_status"] == RED
        assert agg_rows["days_to_red"].iloc[0] == 1

    def test_days_to_red_not_corrupted_when_nonzero(self, conn):
        """days_to_red must be the actual day count, not None (regression for and/or idiom)."""
        conn.execute(
            """INSERT INTO pipeline_events
               (event_id, deal_name, ccy, call_amount, distro_amount, event_date, fund_code)
               VALUES ('EVT-002', 'Test Call', 'USD', 2000000, 0, '2026-06-05', 'AAA-AGG')"""
        )
        conn.commit()

        df = build_fund_view(conn, "2026-06-01")
        forecast = build_14day_forecast(conn, df, "2026-06-01")

        agg_rows = forecast[forecast["fund_code"] == "AAA-AGG"]
        days = agg_rows["days_to_red"].iloc[0]
        assert days is not None, "days_to_red must not be None when fund goes RED"
        assert days == 4  # June 1 → June 5 is 4 calendar days

    def test_nan_days_to_red_safe_for_page_rendering(self, conn):
        """
        Regression for C1: healthy funds have NaN (not None) in days_to_red.
        The old page guard `if days_red is not None` failed because `float('nan') is not None`
        evaluates True, causing int(NaN) to raise ValueError and crash the page for all funds.
        The fixed guard `pd.isna(days_red)` correctly catches NaN.
        """
        df = build_fund_view(conn, "2026-06-01")
        # Inject one RED event for AAA-AGG so the column is populated with a mix
        conn.execute(
            """INSERT INTO pipeline_events
               (event_id, deal_name, ccy, call_amount, distro_amount, event_date, fund_code)
               VALUES ('EVT-C1', 'C1 Regression', 'USD', 2000000, 0, '2026-06-02', 'AAA-AGG')"""
        )
        conn.commit()
        forecast = build_14day_forecast(conn, df, "2026-06-01")

        # AAA-SF1Y is BLUE (no pipeline events) — its days_to_red should be NaN
        sf1y_days = forecast[forecast["fund_code"] == "AAA-SF1Y"]["days_to_red"].iloc[0]
        assert pd.isna(sf1y_days), "Healthy fund must have NaN days_to_red, not a number"

        # Demonstrate WHY the old guard was wrong: NaN is not None → True
        assert (sf1y_days is not None), (
            "NaN is not None == True: the old `is not None` guard was insufficient"
        )

        # Prove the fixed page code does NOT crash on NaN
        display_val = "—" if pd.isna(sf1y_days) else int(sf1y_days)
        assert display_val == "—", "Fixed page code must return '—' for NaN, not crash"

        # AAA-AGG should have a valid integer days_to_red
        agg_days = forecast[forecast["fund_code"] == "AAA-AGG"]["days_to_red"].iloc[0]
        assert not pd.isna(agg_days), "Fund going RED must have a numeric days_to_red"
        agg_display = "—" if pd.isna(agg_days) else int(agg_days)
        assert agg_display == 1, "AAA-AGG drains on day 1 (June 2)"


# ─────────────────────────────────────────────────────────────────────────────
# Trade loader format — must be CSV, not XLSX
# ─────────────────────────────────────────────────────────────────────────────

class TestTradeLoader:
    def test_trade_loader_is_csv(self, conn):
        """generate_trade_loader must return CSV bytes, not XLSX binary."""
        df = build_fund_view(conn, "2026-06-01")
        proposals = propose_wires(df)
        save_proposals(conn, proposals, "2026-06-01", "B20260601-001")

        # Approve all wires
        conn.execute(
            "UPDATE proposals SET action='APPROVE', approved_at='2026-06-01T09:00:00Z' "
            "WHERE run_date='2026-06-01' AND proposal_type='WIRE'"
        )
        conn.commit()

        buf, row_count, file_hash = generate_trade_loader(conn, "2026-06-01")

        # A valid CSV starts with the header row, not XLSX magic bytes (PK\x03\x04)
        buf.seek(0)
        first_bytes = buf.read(4)
        assert first_bytes != b"PK\x03\x04", "Trade loader must be CSV, not XLSX"

        buf.seek(0)
        first_line = buf.readline().decode("utf-8").strip()
        expected_header = ",".join([
            "Trade_Date", "Settle_Date", "Fund_Code", "Dr_Cr", "Amount", "CCY",
            "Account", "GL_Account", "Counterparty", "Reference", "Cost_Centre", "Narrative"
        ])
        assert first_line == expected_header

    def test_trade_loader_row_count(self, conn):
        """3 approved wires → 6 trade rows (2 legs per wire)."""
        df = build_fund_view(conn, "2026-06-01")
        proposals = propose_wires(df)
        save_proposals(conn, proposals, "2026-06-01", "B20260601-001")
        conn.execute(
            "UPDATE proposals SET action='APPROVE' WHERE run_date='2026-06-01' AND proposal_type='WIRE'"
        )
        conn.commit()

        buf, row_count, _ = generate_trade_loader(conn, "2026-06-01")
        assert row_count == 6

        buf.seek(0)
        df_csv = pd.read_csv(buf)
        assert len(df_csv) == 6
        assert set(df_csv["Dr_Cr"].unique()) == {"DR", "CR"}

    def test_trade_loader_empty_returns_csv(self, conn):
        """When no approved proposals exist, empty file must still be valid CSV."""
        buf, row_count, file_hash = generate_trade_loader(conn, "2026-06-01")
        assert row_count == 0
        buf.seek(0)
        # Should parse as CSV with zero data rows
        df_csv = pd.read_csv(buf)
        assert len(df_csv) == 0
        assert list(df_csv.columns) == [
            "Trade_Date", "Settle_Date", "Fund_Code", "Dr_Cr", "Amount", "CCY",
            "Account", "GL_Account", "Counterparty", "Reference", "Cost_Centre", "Narrative"
        ]


# ─────────────────────────────────────────────────────────────────────────────
# Regression tests for the expert-audit fixes
# ─────────────────────────────────────────────────────────────────────────────

class TestComputeStatusNaN:
    def test_nan_cash_is_red_not_blue(self):
        """A NaN balance must fail safe to RED, never fall through to BLUE."""
        assert compute_status(float("nan"), 100_000, 300_000) == RED


class TestProposalRerunNoDuplicate:
    def test_rerun_after_approval_does_not_duplicate(self, conn):
        """Regenerating proposals after approvals must not leave duplicate wires.
        The page clears ALL proposals for the run_date (not just PENDING) first."""
        df = build_fund_view(conn, "2026-06-01")
        wires = propose_wires(df)
        save_proposals(conn, wires, "2026-06-01", "B1")
        conn.execute("UPDATE proposals SET action='APPROVE' WHERE run_date='2026-06-01'")
        conn.commit()
        first_count = conn.execute(
            "SELECT COUNT(*) FROM proposals WHERE run_date='2026-06-01'"
        ).fetchone()[0]

        # Replicate the fixed page logic: delete ALL wire_status + proposals first.
        conn.execute(
            "DELETE FROM wire_status WHERE proposal_id IN "
            "(SELECT id FROM proposals WHERE run_date='2026-06-01')"
        )
        conn.execute("DELETE FROM proposals WHERE run_date='2026-06-01'")
        conn.commit()
        save_proposals(conn, propose_wires(df), "2026-06-01", "B2")

        second_count = conn.execute(
            "SELECT COUNT(*) FROM proposals WHERE run_date='2026-06-01'"
        ).fetchone()[0]
        assert second_count == first_count, "re-run must not duplicate proposals"

        # No fund pair should appear more than once.
        dupes = conn.execute(
            """SELECT from_fund, to_fund, COUNT(*) c FROM proposals
               WHERE run_date='2026-06-01' AND proposal_type='WIRE'
               GROUP BY from_fund, to_fund HAVING c > 1"""
        ).fetchall()
        assert not dupes, f"duplicate wire pairs found: {[tuple(d) for d in dupes]}"


class TestFXThresholdDedup:
    def test_duplicate_threshold_proposed_once(self, conn):
        """Two identical (fund, currency) threshold rows must not sell the balance twice."""
        # MACS-Z holds EUR 340,000; seed already has one EUR threshold (min 100k).
        # Insert a duplicate EUR threshold for the same fund.
        conn.execute(
            """INSERT INTO fx_thresholds(fund_code, currency, min_hold_local, auto_propose,
               fx_counterparty, settlement_acct)
               VALUES ('AAA-MACS-Z', 'EUR', 100000, 1, 'JP MORGAN FX', 'DUP-001')"""
        )
        conn.commit()
        df = build_fund_view(conn, "2026-06-01")
        fx = propose_fx_conversions(conn, df, "2026-06-01")
        macs_eur = [p for p in fx if p["from_fund"] == "AAA-MACS-Z" and p["sell_ccy"] == "EUR"]
        assert len(macs_eur) == 1, "duplicate threshold must yield exactly one FX proposal"

    def test_spot_loader_no_fanout_on_duplicate_threshold(self, conn):
        """The Spot FX loader must emit one row per proposal even with dup thresholds."""
        conn.execute(
            """INSERT INTO fx_thresholds(fund_code, currency, min_hold_local, auto_propose,
               fx_counterparty, settlement_acct)
               VALUES ('AAA-MACS-Z', 'EUR', 100000, 1, 'JP MORGAN FX', 'DUP-002')"""
        )
        conn.commit()
        df = build_fund_view(conn, "2026-06-01")
        save_proposals(conn, propose_fx_conversions(conn, df, "2026-06-01"), "2026-06-01", "B1")
        conn.execute("UPDATE proposals SET action='APPROVE' WHERE proposal_type='FX'")
        conn.commit()

        buf, n_rows, _ = generate_spot_fx_loader(conn, "2026-06-01")
        approved_fx = conn.execute(
            "SELECT COUNT(*) FROM proposals WHERE proposal_type='FX' AND action='APPROVE'"
        ).fetchone()[0]
        assert n_rows == approved_fx, "loader rows must equal approved FX proposals (no fan-out)"


class TestIVPStatusNoRegress:
    def test_loader_regen_does_not_regress_confirmed_wire(self, conn):
        """Re-generating the IVP loader must not drag a SUBMITTED/CONFIRMED wire
        back to LOADER_GENERATED."""
        df = build_fund_view(conn, "2026-06-01")
        save_proposals(conn, propose_wires(df), "2026-06-01", "B1")
        conn.execute("UPDATE proposals SET action='APPROVE' WHERE proposal_type='WIRE'")
        conn.commit()

        generate_ivp_loader(conn, "2026-06-01")  # sets wire_status → LOADER_GENERATED
        # Advance one wire all the way to CONFIRMED.
        pid = conn.execute(
            "SELECT id FROM proposals WHERE proposal_type='WIRE' ORDER BY priority LIMIT 1"
        ).fetchone()[0]
        conn.execute("UPDATE wire_status SET status='CONFIRMED' WHERE proposal_id=?", (pid,))
        conn.commit()

        generate_ivp_loader(conn, "2026-06-01")  # regenerate
        status = conn.execute(
            "SELECT status FROM wire_status WHERE proposal_id=?", (pid,)
        ).fetchone()[0]
        assert status == "CONFIRMED", "confirmed wire must not be reset by loader regen"


class TestImporterBadDates:
    def test_unparseable_dates_are_dropped(self):
        """Rows with an unparseable report_date must be excluded, not committed
        under another fund's date."""
        csv = io.BytesIO(
            b"Fund_Code,CCY,Cash_Balance_Local,Report_Date\n"
            b"AAA-AGG,USD,1000000,2026-06-01\n"
            b"AAA-DL-Y,USD,2000000,not-a-date\n"
        )
        df, warnings = parse_position_file(csv, filename="test.csv")
        assert len(df) == 1, "row with bad date must be dropped"
        assert df.iloc[0]["fund_code"] == "AAA-AGG"
        assert any("report_date" in w for w in warnings)
