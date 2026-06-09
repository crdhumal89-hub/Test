"""
Dashboard — 11-fund status heatmap, KPI cards, alert banner.
This is the first page a controller opens each morning.
"""

import streamlit as st
import pandas as pd

from ui.styles import inject_styles, page_header, status_badge, STATUS_BG, STATUS_FG
from core.engine import (
    build_fund_view, status_summary, latest_run_date, get_amber_buffer, RED, AMBER
)

inject_styles()
page_header("Dashboard", "Daily Cash Position Overview")

conn = st.session_state.get("db")
if conn is None:
    st.error("Database not initialised. Return to the Home page.")
    st.stop()

run_date = latest_run_date(conn)

if not run_date:
    st.warning("No position data loaded yet.")
    st.info("Go to **Import Data** to load today's JPM position file.")
    st.stop()

amber_buffer = get_amber_buffer(conn)
df = build_fund_view(conn, run_date, amber_buffer)
summary = status_summary(df)

# ─────────────────────────────────────────────────────────────────────────────
# Alert Banner
# ─────────────────────────────────────────────────────────────────────────────
if summary[RED] > 0:
    red_funds = df[df["status"] == RED]["fund_code"].tolist()
    st.markdown(
        f'<div class="apollo-alert">ALERT: {summary[RED]} fund(s) are RED and require action: '
        f'{", ".join(red_funds)}</div>',
        unsafe_allow_html=True,
    )

# ─────────────────────────────────────────────────────────────────────────────
# KPI Cards
# ─────────────────────────────────────────────────────────────────────────────
total_cash = df["cash_usd"].sum()

c1, c2, c3, c4, c5 = st.columns(5)
with c1:
    st.metric("Total Cash (USD)", f"${total_cash:,.0f}")
with c2:
    st.metric("RED", summary["RED"],
              delta="Action Required" if summary["RED"] > 0 else None,
              delta_color="inverse")
with c3:
    st.metric("AMBER", summary["AMBER"],
              delta="Monitor" if summary["AMBER"] > 0 else None,
              delta_color="off")
with c4:
    st.metric("GREEN", summary["GREEN"])
with c5:
    st.metric("BLUE (Excess)", summary["BLUE"])

st.caption(f"As of: **{run_date}**")
st.markdown("---")

# ─────────────────────────────────────────────────────────────────────────────
# Fund Status Heatmap Grid (11 fund cards)
# ─────────────────────────────────────────────────────────────────────────────
st.subheader("Fund Status")

funds_list = df.to_dict("records")
cols_per_row = 4

for i in range(0, len(funds_list), cols_per_row):
    cols = st.columns(cols_per_row)
    for j, fund in enumerate(funds_list[i:i + cols_per_row]):
        with cols[j]:
            status = fund["status"]
            bg = STATUS_BG.get(status, "#F8FAFC")
            fg = STATUS_FG.get(status, "#1E293B")
            surplus = fund.get("surplus", 0)
            pct     = fund.get("pct_of_floor", 0)

            surplus_str = f"${abs(surplus):,.0f}"
            surplus_label = "Surplus" if surplus >= 0 else "Deficit"
            surplus_color = fg if surplus < 0 else "#1E293B"

            with st.container(border=True):
                st.markdown(
                    f'<div style="background:{bg};border-radius:4px;padding:8px 10px;">'
                    f'<div style="display:flex;justify-content:space-between;align-items:center;">'
                    f'<b style="font-size:0.85rem;color:#1E293B;">{fund["fund_code"]}</b>'
                    f'<span class="badge badge-{status}">{status}</span>'
                    f'</div>'
                    f'<div style="font-size:1.1rem;font-weight:bold;margin:4px 0;">'
                    f'${fund["cash_usd"]:,.0f}'
                    f'</div>'
                    f'<div style="font-size:0.7rem;color:#475569;">'
                    f'Floor: ${fund["cash_floor"]:,.0f} &nbsp;|&nbsp; {pct:.0f}% of floor'
                    f'</div>'
                    f'<div style="font-size:0.75rem;color:{surplus_color};margin-top:2px;">'
                    f'{surplus_label}: ${surplus_str}'
                    f'</div>'
                    f'</div>',
                    unsafe_allow_html=True,
                )

st.markdown("---")

# ─────────────────────────────────────────────────────────────────────────────
# Full Status Table
# ─────────────────────────────────────────────────────────────────────────────
st.subheader("Full Position Table")

display_cols = ["fund_code", "fund_name", "cash_usd", "cash_floor", "cash_ceiling",
                "status", "surplus", "pct_of_floor"]
df_display = df[display_cols].copy()
df_display.columns = ["Fund Code", "Fund Name", "Cash (USD)", "Floor", "Ceiling",
                      "Status", "Surplus/(Deficit)", "% of Floor"]

# Style rows by status
def _row_style(row):
    bg = STATUS_BG.get(row["Status"], "")
    return [f"background-color: {bg}" if bg else "" for _ in row]

styled = (
    df_display.style
    .apply(_row_style, axis=1)
    .format({
        "Cash (USD)":        "${:,.0f}",
        "Floor":             "${:,.0f}",
        "Ceiling":           "${:,.0f}",
        "Surplus/(Deficit)": "${:,.0f}",
        "% of Floor":        "{:.1f}%",
    })
)

st.dataframe(styled, use_container_width=True, hide_index=True)
