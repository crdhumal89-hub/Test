"""
Audit Log — immutable event viewer for EY audit review.
No edit or delete actions exist on this page by design.
"""

import streamlit as st
import pandas as pd
from datetime import date, timedelta

from ui.styles import inject_styles, page_header

inject_styles()
page_header("Audit Log", "Immutable action history — EY Audit Reference")

conn = st.session_state.get("db")
if conn is None:
    st.error("Database not initialised.")
    st.stop()

# ─────────────────────────────────────────────────────────────────────────────
# Filters
# ─────────────────────────────────────────────────────────────────────────────
col1, col2, col3, col4 = st.columns(4)

with col1:
    date_from = st.date_input("From date", value=date.today() - timedelta(days=7))
with col2:
    date_to = st.date_input("To date", value=date.today())
with col3:
    action_filter = st.selectbox("Action type", ["All",
        "IMPORT_POSITIONS", "PROPOSALS_RUN",
        "WIRE_APPROVE", "WIRE_SKIP", "WIRE_APPROVE_ALL",
        "FX_APPROVE", "FX_SKIP",
        "LOADER_GENERATE", "WIRE_STATUS_UPDATE",
        "PIPELINE_IMPORT", "threshold_change"])
with col4:
    keyword = st.text_input("Keyword search", placeholder="fund code, amount...")

# ─────────────────────────────────────────────────────────────────────────────
# Query
# ─────────────────────────────────────────────────────────────────────────────
query = """
    SELECT id, timestamp, action, entity_type, entity_id, detail
    FROM audit_log
    WHERE timestamp >= ? AND timestamp <= ?
"""
params = [str(date_from) + "T00:00:00Z", str(date_to) + "T23:59:59Z"]

if action_filter != "All":
    query += " AND action = ?"
    params.append(action_filter)

if keyword:
    query += " AND (detail LIKE ? OR entity_id LIKE ?)"
    params.extend([f"%{keyword}%", f"%{keyword}%"])

query += " ORDER BY timestamp DESC LIMIT 500"

df = pd.read_sql(query, conn, params=params)

# ─────────────────────────────────────────────────────────────────────────────
# Stats
# ─────────────────────────────────────────────────────────────────────────────
today_count = conn.execute(
    "SELECT COUNT(*) FROM audit_log WHERE timestamp >= ?",
    (str(date.today()) + "T00:00:00Z",)
).fetchone()[0]

total_count = conn.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0]

c1, c2, c3 = st.columns(3)
c1.metric("Events (filtered)", len(df))
c2.metric("Events today", today_count)
c3.metric("Total events", total_count)

st.caption("Audit log is immutable. No records can be edited or deleted.")

# ─────────────────────────────────────────────────────────────────────────────
# Table
# ─────────────────────────────────────────────────────────────────────────────
if df.empty:
    st.info("No audit events match the current filters.")
else:
    # Highlight error/override actions
    def _highlight_action(val):
        error_keywords = ["ERROR", "FAILED", "OVERRIDE", "UNLOCK", "threshold_change"]
        if any(k in str(val) for k in error_keywords):
            return "background-color: #FEF3C7; color: #92400E"
        return ""

    styled = df.style.map(_highlight_action, subset=["action"])
    st.dataframe(styled, use_container_width=True, hide_index=True)

    # Export
    csv = df.to_csv(index=False).encode()
    st.download_button(
        "Export Filtered Log (CSV)",
        data=csv,
        file_name=f"audit_log_{date_from}_{date_to}.csv",
        mime="text/csv",
    )

    # Detail expander for individual records
    if len(df) > 0:
        st.markdown("---")
        with st.expander("Record Detail"):
            row_id = st.selectbox("Select record ID", df["id"].tolist())
            row = df[df["id"] == row_id].iloc[0]
            for col in df.columns:
                if row[col]:
                    st.markdown(f"**{col}:** `{row[col]}`")
