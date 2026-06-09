"""
Status Review — Full fund position table with sparklines and threshold detail.
"""

import streamlit as st
import pandas as pd

from ui.styles import inject_styles, page_header, STATUS_BG, status_badge
from core.engine import build_fund_view, latest_run_date, get_amber_buffer

inject_styles()
page_header("Status Review", "Fund-by-fund balance vs. floor/ceiling thresholds")

conn = st.session_state.get("db")
if conn is None:
    st.error("Database not initialised.")
    st.stop()

run_date = latest_run_date(conn)
if not run_date:
    st.warning("No positions loaded.")
    st.stop()

amber_buffer = get_amber_buffer(conn)
df = build_fund_view(conn, run_date, amber_buffer)

# ─────────────────────────────────────────────────────────────────────────────
# Filters
# ─────────────────────────────────────────────────────────────────────────────
col1, col2 = st.columns(2)
with col1:
    status_filter = st.multiselect("Filter by status",
                                   ["RED", "AMBER", "GREEN", "BLUE"],
                                   default=["RED", "AMBER", "GREEN", "BLUE"])
with col2:
    sort_by = st.selectbox("Sort by",
                           ["Priority (RED first)", "Fund Code", "Cash (High to Low)", "% of Floor"])

if status_filter:
    df = df[df["status"].isin(status_filter)]

if sort_by == "Priority (RED first)":
    order_map = {"RED": 0, "AMBER": 1, "GREEN": 2, "BLUE": 3}
    df = df.iloc[df["status"].map(order_map).argsort()]
elif sort_by == "Fund Code":
    df = df.sort_values("fund_code")
elif sort_by == "Cash (High to Low)":
    df = df.sort_values("cash_usd", ascending=False)
elif sort_by == "% of Floor":
    df = df.sort_values("pct_of_floor")

st.caption(f"As of: **{run_date}** · {len(df)} funds shown")

# ─────────────────────────────────────────────────────────────────────────────
# Table with inline status badges
# ─────────────────────────────────────────────────────────────────────────────
display_df = df[[
    "fund_code", "fund_name", "cash_usd", "cash_floor", "cash_ceiling",
    "status", "surplus", "pct_of_floor"
]].copy()

display_df.columns = [
    "Fund Code", "Fund Name", "Cash (USD)", "Floor", "Ceiling",
    "Status", "Surplus/(Deficit)", "% of Floor"
]

def _row_bg(row):
    bg = STATUS_BG.get(row["Status"], "")
    return [f"background-color: {bg}" if bg else "" for _ in row]

styled = (
    display_df.style
    .apply(_row_bg, axis=1)
    .format({
        "Cash (USD)":         "${:,.0f}",
        "Floor":              "${:,.0f}",
        "Ceiling":            "${:,.0f}",
        "Surplus/(Deficit)":  "${:,.0f}",
        "% of Floor":         "{:.1f}%",
    })
)

st.dataframe(styled, use_container_width=True, hide_index=True, height=420)

# ─────────────────────────────────────────────────────────────────────────────
# 7-day sparklines (per-fund balance history)
# ─────────────────────────────────────────────────────────────────────────────
st.markdown("---")
st.subheader("7-Day Balance Trend")

df_history = pd.read_sql(
    """SELECT run_date, fund_code, SUM(functional_usd) AS cash_usd
       FROM positions
       GROUP BY run_date, fund_code
       ORDER BY run_date""",
    conn
)

if len(df_history["run_date"].unique()) < 2:
    st.caption("Load at least 2 days of position data to see trend charts.")
else:
    selected_fund = st.selectbox("Select fund for trend", df["fund_code"].tolist())
    fund_hist = df_history[df_history["fund_code"] == selected_fund].set_index("run_date")

    if fund_hist.empty:
        st.caption("No history for this fund.")
    else:
        fund_row = df[df["fund_code"] == selected_fund].iloc[0]
        floor_val = fund_row["cash_floor"]

        # Add floor reference line
        chart_df = fund_hist[["cash_usd"]].copy()
        chart_df["Floor"] = floor_val
        st.line_chart(chart_df)
        st.caption(f"Floor line at ${floor_val:,.0f}")

# ─────────────────────────────────────────────────────────────────────────────
# Export
# ─────────────────────────────────────────────────────────────────────────────
st.markdown("---")
csv = display_df.to_csv(index=False).encode()
st.download_button(
    "Export Status Table (CSV)",
    data=csv,
    file_name=f"fund_status_{run_date}.csv",
    mime="text/csv",
)
