"""
Settings — Fund master CRUD, FX rates, thresholds, email config.
All changes require admin password confirmation and are audit-logged.
"""

import streamlit as st
import pandas as pd
from datetime import date

from ui.styles import inject_styles, page_header
from core.database import log_audit
from core.engine import _get_setting

inject_styles()
page_header("Settings", "Fund master, thresholds, FX rates, email configuration")

conn = st.session_state.get("db")
if conn is None:
    st.error("Database not initialised.")
    st.stop()

# ─────────────────────────────────────────────────────────────────────────────
# Admin authentication gate
# ─────────────────────────────────────────────────────────────────────────────
ADMIN_PWD = _get_setting(conn, "ADMIN_PASSWORD", "ApolloAdmin2026")

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
        for _, row in edited.iterrows():
            old_row = df_funds[df_funds["fund_code"] == row["fund_code"]].iloc[0]
            conn.execute(
                """UPDATE funds SET fund_name=?, entity_type=?, ccy=?,
                   cash_floor=?, cash_ceiling=?, routing_source=?, fund_contact=?,
                   ssi_account=?, ssi_bank=?, ssi_bic=?, ssi_entity=?,
                   active=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
                   WHERE fund_code=?""",
                (row["fund_name"], row["entity_type"], row["ccy"],
                 row["cash_floor"], row["cash_ceiling"], row.get("routing_source"),
                 row.get("fund_contact"), row.get("ssi_account"), row.get("ssi_bank"),
                 row.get("ssi_bic"), row.get("ssi_entity"), int(row["active"]),
                 row["fund_code"])
            )
        conn.commit()
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
    today_str = str(date.today())
    stale = df_fx[df_fx["rate_date"] < today_str]
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
        for _, row in edited_fx.iterrows():
            conn.execute(
                """INSERT OR REPLACE INTO fx_rates(base, quote, rate, rate_date)
                   VALUES (?, ?, ?, ?)""",
                (row["base"], row["quote"], row["rate"], row["rate_date"])
            )
        conn.commit()
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
        conn.execute("DELETE FROM fx_thresholds")
        for _, row in edited_thresh.iterrows():
            conn.execute(
                """INSERT INTO fx_thresholds
                   (fund_code, currency, min_hold_local, auto_propose, fx_counterparty, settlement_acct)
                   VALUES (?,?,?,?,?,?)""",
                (row["fund_code"], row["currency"], row["min_hold_local"],
                 int(row["auto_propose"]), row.get("fx_counterparty"), row.get("settlement_acct"))
            )
        conn.commit()
        log_audit(conn, "FX_THRESHOLDS_SAVED", "fx_thresholds", "all",
                  f"FX thresholds updated: {len(edited_thresh)} rows")
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
            val = st.text_input(
                f"{key}",
                value=str(row["value"]),
                help=row.get("description", ""),
                key=f"setting_{key}"
            )
            updated[key] = val

        save_settings = st.form_submit_button("Save Settings", type="primary")

    if save_settings:
        for key, val in updated.items():
            conn.execute(
                """UPDATE app_settings SET value=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
                   WHERE key=?""",
                (val, key)
            )
        conn.commit()
        log_audit(conn, "GLOBAL_SETTINGS_SAVED", "app_settings", "all",
                  f"Updated {len(updated)} settings")
        st.toast("Settings saved", icon="✅")
        st.rerun()

    # Send test digest
    st.markdown("---")
    controller_email = _get_setting(conn, "CONTROLLER_EMAIL", "")
    if st.button(f"Send Test Digest to {controller_email}"):
        st.info("SMTP email integration: configure SMTP_HOST in settings above to enable.")

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
        conn.execute("DELETE FROM holidays")
        for _, row in edited_hols.iterrows():
            if row["holiday_date"]:
                conn.execute(
                    "INSERT OR REPLACE INTO holidays VALUES (?, ?)",
                    (str(row["holiday_date"]), row.get("description", ""))
                )
        conn.commit()
        log_audit(conn, "HOLIDAYS_SAVED", "holidays", "all",
                  f"Updated {len(edited_hols)} holidays")
        st.toast("Holidays saved", icon="✅")
        st.rerun()
