"""
Headless render smoke tests for every Streamlit page.

Unit tests in test_engine.py cover business logic but never execute the pages,
so library-version regressions (e.g. pandas 3.0 removing Styler.applymap) slip
through. These tests run each page through streamlit.testing.v1.AppTest against
a fully seeded in-memory database and assert the page renders with no exception.

A connection created with check_same_thread=False is required because AppTest
runs the page script in Streamlit's ScriptRunner thread, not the test thread.
"""

import sqlite3
from datetime import date
from pathlib import Path

import pytest

from streamlit.testing.v1 import AppTest

from core.database import init_db, log_audit
from core.engine import (
    build_fund_view, propose_wires, propose_fx_conversions, save_proposals,
)

APP_DIR = Path(__file__).resolve().parent.parent
RUN_DATE = "2026-06-01"

PAGES = [
    "app.py",
    "pages/1_Dashboard.py",
    "pages/2_Import.py",
    "pages/3_Status_Review.py",
    "pages/4_Proposals.py",
    "pages/5_Loaders.py",
    "pages/6_Forecast.py",
    "pages/7_Wire_Status.py",
    "pages/8_Audit_Log.py",
    "pages/9_Settings.py",
]


def _seed(conn: sqlite3.Connection):
    """Seed a complete end-of-workflow scenario so every page hits its full
    render path (approved proposals, wire-status rows, pipeline RED, audit rows)."""
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
        conn.execute(
            """INSERT INTO positions(run_date, fund_code, account_name, ccy,
               local_balance, functional_usd)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (RUN_DATE, fund, acct, ccy, bal, bal * rate_map.get(ccy, 1.0)),
        )
    conn.commit()

    # Generate + approve proposals so Loaders / Wire Status pages have data.
    df = build_fund_view(conn, RUN_DATE)
    wires = propose_wires(df)
    fx = propose_fx_conversions(conn, df, RUN_DATE)
    save_proposals(conn, wires + fx, RUN_DATE, "B20260601-001")
    conn.execute("UPDATE proposals SET action='APPROVE' WHERE run_date=?", (RUN_DATE,))
    conn.commit()

    # Pipeline event that drains AAA-AGG below floor → forecast projects RED,
    # exercising the days_to_red int() path that crashed pre-fix.
    conn.execute(
        """INSERT INTO pipeline_events
           (event_id, deal_name, ccy, call_amount, distro_amount, event_date, fund_code)
           VALUES ('EVT-SMOKE', 'Smoke Call', 'USD', 2000000, 0, '2026-06-02', 'AAA-AGG')"""
    )
    conn.commit()

    log_audit(conn, "IMPORT_POSITIONS", "positions", RUN_DATE, "Smoke-test seed")
    log_audit(conn, "PROPOSALS_RUN", "proposals", RUN_DATE, "Smoke-test seed")


@pytest.fixture
def seeded_conn():
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    init_db(conn)
    _seed(conn)
    yield conn
    conn.close()


@pytest.mark.parametrize("page", PAGES)
def test_page_renders_without_exception(page, seeded_conn):
    at = AppTest.from_file(str(APP_DIR / page), default_timeout=30)
    at.session_state["db"] = seeded_conn
    at.session_state["settings_unlocked"] = True  # bypass admin gate for Settings page
    at.run()
    assert not at.exception, f"{page} raised: {at.exception}"
