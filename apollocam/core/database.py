"""
SQLite connection factory and schema initialisation for ApolloCAM Phase 2.
Uses st.cache_resource to return one shared connection across Streamlit sessions.
Schema is designed for zero-friction PostgreSQL migration: no SQLite-specific
types in application logic, all timestamps ISO 8601, PRAGMA foreign_keys=ON.
"""

import sqlite3
import os
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "apollocam.db"


def get_connection() -> sqlite3.Connection:
    """
    Return a persistent SQLite connection.
    In Streamlit, wrap this with @st.cache_resource so one connection is shared
    across all sessions (avoids redundant connections on every rerun).
    """
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")   # better concurrency for Streamlit
    conn.execute("PRAGMA synchronous = NORMAL") # safe + faster than FULL for local use
    return conn


DDL = """
-- ──────────────────────────────────────────────────────────────────────────
-- FUND MASTER
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS funds (
    fund_code    TEXT PRIMARY KEY,
    fund_name    TEXT NOT NULL,
    entity_type  TEXT,
    ccy          TEXT NOT NULL DEFAULT 'USD',
    cash_floor   REAL NOT NULL DEFAULT 0,
    cash_ceiling REAL NOT NULL DEFAULT 0,
    parent_fund  TEXT,
    routing_source TEXT REFERENCES funds(fund_code),
    fund_contact TEXT,
    ssi_account  TEXT,
    ssi_bank     TEXT,
    ssi_bic      TEXT,
    ssi_entity   TEXT,
    active       INTEGER NOT NULL DEFAULT 1,
    updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ──────────────────────────────────────────────────────────────────────────
-- FX THRESHOLDS
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fx_thresholds (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    fund_code       TEXT NOT NULL REFERENCES funds(fund_code),
    currency        TEXT NOT NULL,
    min_hold_local  REAL NOT NULL DEFAULT 0,
    auto_propose    INTEGER NOT NULL DEFAULT 1,
    fx_counterparty TEXT,
    settlement_acct TEXT
);

-- ──────────────────────────────────────────────────────────────────────────
-- FX RATES
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fx_rates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    base        TEXT NOT NULL,
    quote       TEXT NOT NULL DEFAULT 'USD',
    rate        REAL NOT NULL,
    rate_date   TEXT NOT NULL,
    loaded_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(base, quote, rate_date)
);

-- ──────────────────────────────────────────────────────────────────────────
-- APP SETTINGS (key-value store for global config)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    description TEXT,
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ──────────────────────────────────────────────────────────────────────────
-- DAILY POSITIONS
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS positions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_date        TEXT NOT NULL,
    fund_code       TEXT NOT NULL REFERENCES funds(fund_code),
    account_name    TEXT,
    ccy             TEXT NOT NULL,
    local_balance   REAL NOT NULL DEFAULT 0,
    functional_usd  REAL,
    loaded_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    source_file     TEXT
);
CREATE INDEX IF NOT EXISTS idx_pos_date_fund ON positions(run_date, fund_code);

-- ──────────────────────────────────────────────────────────────────────────
-- PROPOSALS (wire transfers + spot FX conversions)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposals (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id        TEXT,
    run_date        TEXT NOT NULL,
    proposal_type   TEXT NOT NULL CHECK(proposal_type IN ('WIRE','FX')),
    from_fund       TEXT REFERENCES funds(fund_code),
    to_fund         TEXT REFERENCES funds(fund_code),
    sell_ccy        TEXT NOT NULL,
    sell_amount     REAL NOT NULL,
    buy_ccy         TEXT NOT NULL DEFAULT 'USD',
    buy_amount      REAL,
    fx_rate         REAL,
    value_date      TEXT,
    priority        INTEGER,
    action          TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK(action IN ('PENDING','APPROVE','SKIP','HOLD')),
    approved_at     TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_prop_date ON proposals(run_date, action);

-- ──────────────────────────────────────────────────────────────────────────
-- WIRE STATUS TRACKER
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wire_status (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id      INTEGER NOT NULL REFERENCES proposals(id),
    batch_id         TEXT,
    wire_reference   TEXT,
    status           TEXT NOT NULL DEFAULT 'PROPOSED'
                     CHECK(status IN ('PROPOSED','APPROVED','LOADER_GENERATED',
                                      'SUBMITTED','CONFIRMED','REJECTED')),
    confirmation_ref TEXT,
    submitted_at     TEXT,
    confirmed_at     TEXT,
    notes            TEXT,
    updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ──────────────────────────────────────────────────────────────────────────
-- LOADER FILES LOG
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loader_files (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id     TEXT NOT NULL,
    loader_type  TEXT NOT NULL CHECK(loader_type IN ('IVP','TRADE','SPOT_FX')),
    row_count    INTEGER NOT NULL DEFAULT 0,
    file_hash    TEXT,
    generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ──────────────────────────────────────────────────────────────────────────
-- PIPELINE EVENTS (powers 14-day forecast)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        TEXT UNIQUE,
    deal_name       TEXT,
    bucket          TEXT,
    ccy             TEXT NOT NULL,
    call_amount     REAL NOT NULL DEFAULT 0,
    distro_amount   REAL NOT NULL DEFAULT 0,
    event_date      TEXT NOT NULL,
    sub_fund_acct   TEXT,
    fund_code       TEXT,
    loaded_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    source_file     TEXT
);
CREATE INDEX IF NOT EXISTS idx_pipe_date ON pipeline_events(event_date, fund_code);

-- ──────────────────────────────────────────────────────────────────────────
-- HOLIDAY CALENDAR
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS holidays (
    holiday_date TEXT PRIMARY KEY,
    description  TEXT
);

-- ──────────────────────────────────────────────────────────────────────────
-- AUDIT LOG (immutable — INSERT ONLY, enforced by triggers)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    action      TEXT NOT NULL,
    entity_type TEXT,
    entity_id   TEXT,
    detail      TEXT,
    before_state TEXT,
    after_state  TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(timestamp);

CREATE TRIGGER IF NOT EXISTS audit_no_update
    BEFORE UPDATE ON audit_log
BEGIN
    SELECT RAISE(ABORT, 'audit_log is immutable: UPDATE not permitted');
END;

CREATE TRIGGER IF NOT EXISTS audit_no_delete
    BEFORE DELETE ON audit_log
BEGIN
    SELECT RAISE(ABORT, 'audit_log is immutable: DELETE not permitted');
END;

CREATE TRIGGER IF NOT EXISTS trg_fund_threshold_audit
    AFTER UPDATE ON funds
    WHEN OLD.cash_floor <> NEW.cash_floor OR OLD.cash_ceiling <> NEW.cash_ceiling
BEGIN
    INSERT INTO audit_log(action, entity_type, entity_id, before_state, after_state)
    VALUES(
        'threshold_change', 'fund', NEW.fund_code,
        json_object('floor', OLD.cash_floor, 'ceiling', OLD.cash_ceiling),
        json_object('floor', NEW.cash_floor, 'ceiling', NEW.cash_ceiling)
    );
END;
"""


SEED_SQL = """
-- 11 AAA funds (mirrors SETTINGS rows 16-26)
INSERT OR IGNORE INTO funds VALUES
  ('AAA-AGG',        'Apollo Aligned Alternatives Aggregator, L.P.',     'Aggregator', 'USD', 1500000, 3000000,  NULL,        NULL,          NULL, 'S 17017', 'JPMORGAN CHASE NA', 'CHASUS33', 'APOLLO ALIGNED ALTERNATIVES AGR LP',       1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('AAA-LUX-AGG',    'AAA Lux Aggregator, L.P.',                          'Aggregator', 'USD',  500000, 1000000,  NULL,        NULL,          NULL, 'S 20454', 'JPMORGAN CHASE NA', 'CHASUS33', 'AAA LUX AGGREGATOR LP',                      1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('AAA-IDF-AGG',    'AAA IDF, L.P.',                                     'Aggregator', 'USD',  150000,  400000,  NULL,        'AAA-AGG',     NULL, 'S 23061', 'JPMORGAN CHASE NA', 'CHASUS33', 'AAA IDF LP',                                 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('AAA-SF1Y',       'AAA Sub Fund 1-Y, L.P.',                            'Sub-Fund',   'USD', 2000000, 5000000,  'AAA-AGG',   'AAA-AGG',     NULL, 'S 19834', 'JPMORGAN CHASE NA', 'CHASUS33', 'AAA SUB FUND 1-Y LP INV ACC FBO WFG',        1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('AAA-MACS-Z',     'AAA Multi-Asset Credit Strategies (Z), L.P.',       'Sub-Fund',   'USD',  250000,  650000,  'AAA-AGG',   'AAA-AGG',     NULL, 'S 20510', 'JPMORGAN CHASE NA', 'CHASUS33', 'AAA MULTI-ASSET CREDIT STRATEGIES Z LP',     1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('AAA-DL-Y',       'AAA Direct Lending (Y), L.P.',                      'Sub-Fund',   'USD',  100000,  300000,  'AAA-SF1Y',  'AAA-SF1Y',    NULL, 'S 20986', 'JPMORGAN CHASE NA', 'CHASUS33', 'AAA DIRECT LENDING Y LP',                    1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('AAA-HOSTPLUS-II','Apollo HostPlus Credit II Holdings II, L.P.',        'Sub-Fund',   'USD',  400000,  600000,  'AAA-AGG',   'AAA-AGG',     NULL, 'S 22917', 'JPMORGAN CHASE NA', 'CHASUS33', 'APOLLO HOSTPLUS CREDIT II HOLDINGS II LP',   1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('AAA-SF4Z',       'AAA Sub Fund 4-Z, L.P.',                            'Sub-Fund',   'USD',  115000,  250000,  'AAA-AGG',   'AAA-AGG',     NULL, 'S 19838', 'JPMORGAN CHASE NA', 'CHASUS33', 'AAA SUB FUND 4-Z LP INV ACC FBO WFG',        1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('AAA-SF2Y',       'AAA Sub Fund 2-Y, L.P.',                            'Sub-Fund',   'USD',  110000,  300000,  'AAA-AGG',   'AAA-AGG',     NULL, 'S 19836', 'JPMORGAN CHASE NA', 'CHASUS33', 'AAA SUB FUND 2-Y LP INV ACC FBO WFG',        1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('AAA-SF1YS',      'AAA Sub Fund 1-YS, L.P.',                           'Sub-Fund',   'USD',   75000,  200000,  'AAA-SF1Y',  'AAA-SF1Y',    NULL, 'S 20680', 'JPMORGAN CHASE NA', 'CHASUS33', 'AAA SUB FUND 1-YS LP INV FBO WELLS FARGO',  1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('AAA-LIBRA',      'Apollo Libra Credit Opportunities Fund, L.P.',       'Sub-Fund',   'USD',   50000,  120000,  'AAA-AGG',   'AAA-AGG',     NULL, 'S 20404', 'JPMORGAN CHASE NA', 'CHASUS33', 'APOLLO LIBRA CREDIT OPPORTUNITIES FUND LP', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Spot FX thresholds (mirrors SETTINGS rows 34-36)
INSERT OR IGNORE INTO fx_thresholds(fund_code, currency, min_hold_local, auto_propose, fx_counterparty, settlement_acct) VALUES
  ('AAA-LUX-AGG',    'EUR', 50000,  1, 'JP MORGAN FX', 'JPEUR-LUXAGG-001'),
  ('AAA-MACS-Z',     'EUR', 100000, 1, 'JP MORGAN FX', 'JPEUR-MACSZ-001'),
  ('AAA-HOSTPLUS-II','GBP', 50000,  1, 'JP MORGAN FX', 'JPGBP-HOSTII-001');

-- FX rates (as of 01-Jun-2026)
INSERT OR IGNORE INTO fx_rates(base, quote, rate, rate_date) VALUES
  ('USD', 'USD', 1.0000, '2026-06-01'),
  ('EUR', 'USD', 1.0900, '2026-06-01'),
  ('GBP', 'USD', 1.2700, '2026-06-01');

-- Global settings (mirrors SETTINGS rows 5-12)
INSERT OR IGNORE INTO app_settings(key, value, description) VALUES
  ('AMBER_BUFFER',              '1.10',                     'Multiplier of floor marking the AMBER ceiling'),
  ('DL_EMAIL',                  'cash_mgmt_dl@apollo.com',  'Distribution list email for daily digest'),
  ('CONTROLLER_EMAIL',          'a.shinde@apollo.com',      'Controller email for CC on all alerts'),
  ('DIGEST_ENABLED',            'True',                     'Enable/disable daily digest email'),
  ('ALERT_ONLY_WHEN_RED',       'True',                     'Only send alerts for RED status funds'),
  ('MAX_ALERTS_PER_FUND_PER_DAY','1',                       'Max threshold alerts per fund per calendar day'),
  ('FX_STALE_DAYS',             '1',                        'Days before FX rate is considered stale'),
  ('SPOT_VALUE_LAG_DAYS',       '2',                        'T+N value date for spot FX conversions'),
  ('SMTP_HOST',                 '',                         'SMTP server hostname (blank = Outlook COM)'),
  ('SMTP_PORT',                 '587',                      'SMTP server port'),
  ('SMTP_USER',                 '',                         'SMTP username'),
  ('SMTP_PASSWORD',             '',                         'SMTP password (store in .env, not here)'),
  ('ADMIN_PASSWORD',            'ApolloAdmin2026',          'Admin password for settings changes');

-- US holidays 2026
INSERT OR IGNORE INTO holidays(holiday_date, description) VALUES
  ('2026-01-01', 'New Year''s Day'),
  ('2026-05-25', 'Memorial Day'),
  ('2026-07-04', 'Independence Day'),
  ('2026-09-07', 'Labor Day');
"""


def init_db(conn: sqlite3.Connection | None = None) -> None:
    """Create all tables and seed reference data. Safe to call on every startup."""
    if conn is None:
        conn = get_connection()
    conn.executescript(DDL)
    conn.executescript(SEED_SQL)
    conn.commit()


def log_audit(conn: sqlite3.Connection, action: str, entity_type: str = None,
              entity_id: str = None, detail: str = None,
              before_state: str = None, after_state: str = None) -> None:
    """Append one immutable row to audit_log."""
    conn.execute(
        """INSERT INTO audit_log(action, entity_type, entity_id, detail, before_state, after_state)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (action, entity_type, entity_id, detail, before_state, after_state)
    )
    conn.commit()
