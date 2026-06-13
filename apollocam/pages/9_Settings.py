"""
Settings — Fund master CRUD, FX rates, thresholds, email config.
All changes require admin password confirmation and are audit-logged.
"""

import os
import streamlit as st
import pandas as pd
from datetime import date, timedelta

try:
    from dotenv import load_dotenv
except ImportError:  # python-dotenv is optional — fall back to real env vars only
    def load_dotenv(*_a, **_k):
        return False

from ui.styles import inject_styles, page_header
from core.database import log_audit
from core.engine import _get_setting, latest_run_date


def _num(value, fallback=0.0):
    """Coerce a possibly-blank/NaN editor cell to float; fall back if invalid.
    Prevents a cleared NOT NULL numeric cell from aborting the save."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return fallback
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _txt(value, fallback=None):
    """Coerce a possibly-NaN editor cell to a clean string or `fallback`.
    pandas Series.get returns NaN (not the default) for present-but-NaN cells."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return fallback
    s = str(value).strip()
    return s if s else fallback

inject_styles()
page_header("Settings", "Fund master, thresholds, FX rates, email configuration")

conn = st.session_state.get("db")
if conn is None:
    st.error("Database not initialised.")
    st.stop()

# ─────────────────────────────────────────────────────────────────────────────
# Admin authentication gate
# ─────────────────────────────────────────────────────────────────────────────
# Env var (.env) overrides the DB setting, matching .env.example's documented
# contract and keeping the password out of the database when set.
load_dotenv()
ADMIN_PWD = os.getenv("ADMIN_PASSWORD") or _get_setting(conn, "ADMIN_PASSWORD", "UNCONFIGURED")

if "settings_unlocked" not in st.session_state:
    st.session_state["settings_unlocked"] = False

if not st.session_state["settings_unlocked"]:
    st.warning("Settings are admin-protected.")
    with st.form("admin_login"):
        pwd = st.text_input("Admin password", type="password")
        unlock = st.form_submit_button("Unlock Settings")
    if unlock:
        if pwd == ADMIN_PWD:
            st.session_state["settings_unlocked"] = True
            log_audit(conn, "SETTINGS_UNLOCKED", "settings", "admin", "Admin unlocked settings page")
            st.rerun()
        else:
            st.error("Incorrect password.")
            log_audit(conn, "SETTINGS_UNLOCK_FAILED", "settings", "admin", "Incorrect admin password")
    st.stop()

st.success("Settings unlocked. All changes are audit-logged.")
if st.button("Lock Settings"):
    st.session_state["settings_unlocked"] = False
    st.rerun()

st.markdown("---")
tab1, tab2, tab3, tab4, tab5 = st.tabs(
    ["Fund Master", "FX Rates", "FX Thresholds", "Global Settings", "Holiday Calendar"]
)

# ─────────────────────────────────────────────────────────────────────────────
# Tab 1: Fund Master
# ─────────────────────────────────────────────────────────────────────────────
with tab1:
    st.subheader("Fund Master (11 Active Funds)")
    df_funds = pd.read_sql("SELECT * FROM funds WHERE active=1 ORDER BY fund_code", conn)

    edited = st.data_editor(
        df_funds,
        use_container_width=True,
        hide_index=True,
        disabled=["fund_code", "updated_at"],
        column_config={
            "cash_floor":    st.column_config.NumberColumn("Floor (USD)", format="$%.0f"),
            "cash_ceiling":  st.column_config.NumberColumn("Ceiling (USD)", format="$%.0f"),
            "active":        st.column_config.CheckboxColumn("Active"),
        },
        key="fund_editor"
    )

    if st.button("Save Fund Master", type="primary"):
        # Atomic: if any row fails validation the whole save rolls back rather
        # than leaving the master half-updated.
        with conn:
            for _, row in edited.iterrows():
                old_row = df_funds[df_funds["fund_code"] == row["fund_code"]].iloc[0]
                conn.execute(
                    """UPDATE funds SET fund_name=?, entity_type=?, ccy=?,
                       cash_floor=?, cash_ceiling=?, routing_source=?, fund_contact=?,
                       ssi_account=?, ssi_bank=?, ssi_bic=?, ssi_entity=?,
                       active=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
                       WHERE fund_code=?""",
                    (_txt(row["fund_name"], old_row["fund_name"]), _txt(row["entity_type"]),
                     _txt(row["ccy"], "USD"),
                     _num(row["cash_floor"]), _num(row["cash_ceiling"]),
                     _txt(row.get("routing_source")), _txt(row.get("fund_contact")),
                     _txt(row.get("ssi_account")), _txt(row.get("ssi_bank")),
                     _txt(row.get("ssi_bic")), _txt(row.get("ssi_entity")),
                     int(bool(row["active"])), row["fund_code"])
                )
        log_audit(conn, "FUND_MASTER_SAVED", "funds", "all", "Fund master updated via Settings UI")
        st.toast("Fund master saved", icon="✅")
        st.rerun()

# ─────────────────────────────────────────────────────────────────────────────
# Tab 2: FX Rates
# ─────────────────────────────────────────────────────────────────────────────
with tab2:
    st.subheader("FX Rates")
    df_fx = pd.read_sql(
        """SELECT base, quote, rate, rate_date FROM fx_rates
           WHERE (base, rate_date) IN (
               SELECT base, MAX(rate_date) FROM fx_rates GROUP BY base
           ) ORDER BY base""",
        conn
    )

    stale_days = int(_get_setting(conn, "FX_STALE_DAYS", "1"))
    cutoff_str = str(date.today() - timedelta(days=stale_days))
    stale = df_fx[df_fx["rate_date"] < cutoff_str]
    if not stale.empty:
        st.warning(f"Stale FX rates detected (older than {stale_days} day(s)): "
                   + ", ".join(stale["base"].tolist()))

    edited_fx = st.data_editor(
        df_fx, use_container_width=True, hide_index=True,
        column_config={
            "rate": st.column_config.NumberColumn("Rate", format="%.4f"),
        },
        key="fx_editor"
    )

    if st.button("Save FX Rates", type="primary"):
        with conn:
            for _, row in edited_fx.iterrows():
                base = _txt(row["base"])
                rate_date = _txt(row["rate_date"])
                if not base or not rate_date:
                    continue  # skip incomplete rows rather than violating NOT NULL
                conn.execute(
                    """INSERT OR REPLACE INTO fx_rates(base, quote, rate, rate_date)
                       VALUES (?, ?, ?, ?)""",
                    (base.upper(), _txt(row["quote"], "USD"), _num(row["rate"], 1.0), rate_date)
                )
        log_audit(conn, "FX_RATES_SAVED", "fx_rates", "all",
                  f"FX rates updated: {len(edited_fx)} rows")
        st.toast("FX rates saved", icon="✅")
        st.rerun()

# ─────────────────────────────────────────────────────────────────────────────
# Tab 3: FX Thresholds
# ─────────────────────────────────────────────────────────────────────────────
with tab3:
    st.subheader("Spot FX Thresholds")
    df_thresh = pd.read_sql("SELECT * FROM fx_thresholds ORDER BY fund_code", conn)

    edited_thresh = st.data_editor(
        df_thresh, use_container_width=True, hide_index=True,
        column_config={
            "auto_propose": st.column_config.CheckboxColumn("Auto Propose"),
            "min_hold_local": st.column_config.NumberColumn("Min Hold (Local)", format="%.0f"),
        },
        key="thresh_editor"
    )

    if st.button("Save FX Thresholds", type="primary"):
        # Drop duplicate (fund, currency) rules so the same balance is never
        # proposed for sale twice. Atomic so the DELETE can't wipe the table if
        # a later INSERT fails.
        seen = set()
        written = 0
        with conn:
            conn.execute("DELETE FROM fx_thresholds")
            for _, row in edited_thresh.iterrows():
                fund = _txt(row["fund_code"])
                ccy = _txt(row["currency"])
                if not fund or not ccy or (fund, ccy.upper()) in seen:
                    continue
                seen.add((fund, ccy.upper()))
                conn.execute(
                    """INSERT INTO fx_thresholds
                       (fund_code, currency, min_hold_local, auto_propose, fx_counterparty, settlement_acct)
                       VALUES (?,?,?,?,?,?)""",
                    (fund, ccy.upper(), _num(row["min_hold_local"]),
                     int(bool(row["auto_propose"])), _txt(row.get("fx_counterparty")),
                     _txt(row.get("settlement_acct")))
                )
                written += 1
        log_audit(conn, "FX_THRESHOLDS_SAVED", "fx_thresholds", "all",
                  f"FX thresholds updated: {written} rows")
        st.toast("FX thresholds saved", icon="✅")
        st.rerun()

# ─────────────────────────────────────────────────────────────────────────────
# Tab 4: Global Settings
# ─────────────────────────────────────────────────────────────────────────────
with tab4:
    st.subheader("Global Settings")
    df_settings = pd.read_sql(
        "SELECT key, value, description FROM app_settings ORDER BY key", conn
    )

    with st.form("global_settings"):
        updated: dict[str, str] = {}
        for _, row in df_settings.iterrows():
            key = row["key"]
            if key == "ADMIN_PASSWORD":
                continue  # never show admin password in UI
            # Mask credential fields so they are not visible on screen
            input_type = "password" if "PASSWORD" in key.upper() else "default"
            val = st.text_input(
                f"{key}",
                value=str(row["value"]),
                help=row.get("description", ""),
                type=input_type,
                key=f"setting_{key}"
            )
            updated[key] = val

        save_settings = st.form_submit_button("Save Settings", type="primary")

    if save_settings:
        with conn:
            for key, val in updated.items():
                conn.execute(
                    """UPDATE app_settings SET value=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
                       WHERE key=?""",
                    (val, key)
                )
        log_audit(conn, "GLOBAL_SETTINGS_SAVED", "app_settings", "all",
                  f"Updated {len(updated)} settings")
        st.toast("Settings saved", icon="✅")
        st.rerun()

    # Send test digest — explicit, deliberate user action.
    st.markdown("---")
    controller_email = _get_setting(conn, "CONTROLLER_EMAIL", "")
    digest_date = latest_run_date(conn)
    st.caption(
        "Delivery requires SMTP_HOST (or Windows Outlook). With neither configured "
        "the digest is queued but cannot be delivered. The queue event is recorded in "
        "the Audit Log; delivery success/failure is written to the application log."
    )
    if st.button(f"Send Test Digest to {controller_email or '(no controller email set)'}",
                 disabled=not controller_email):
        if not digest_date:
            st.warning("Load positions first — there is nothing to summarise yet.")
        else:
            from core.email_notify import enqueue_email, _build_digest_html
            html = _build_digest_html(conn, digest_date)
            enqueue_email(
                "digest_test", [controller_email],
                f"ApolloCAM Test Digest — {digest_date}", html,
                conn=conn, business_date=digest_date, sent_by="settings_test",
            )
            log_audit(conn, "DIGEST_TEST_QUEUED", "app_settings", controller_email,
                      f"Test digest queued for {digest_date}")
            st.success(f"Test digest queued to {controller_email}.")

# ─────────────────────────────────────────────────────────────────────────────
# Tab 5: Holiday Calendar
# ─────────────────────────────────────────────────────────────────────────────
with tab5:
    st.subheader("Holiday Calendar")
    df_holidays = pd.read_sql(
        "SELECT holiday_date, description FROM holidays ORDER BY holiday_date", conn
    )

    edited_hols = st.data_editor(
        df_holidays,
        use_container_width=True,
        hide_index=True,
        num_rows="dynamic",
        key="holiday_editor"
    )

    if st.button("Save Holidays", type="primary"):
        with conn:
            conn.execute("DELETE FROM holidays")
            for _, row in edited_hols.iterrows():
                hol = _txt(row["holiday_date"])
                if hol:
                    conn.execute(
                        "INSERT OR REPLACE INTO holidays VALUES (?, ?)",
                        (hol[:10], _txt(row.get("description"), ""))
                    )
        log_audit(conn, "HOLIDAYS_SAVED", "holidays", "all",
                  f"Updated {len(edited_hols)} holidays")
        st.toast("Holidays saved", icon="✅")
        st.rerun()
