"""
14-Day Forecast — Import pipeline events and project fund cash positions forward.
Uses strict fund_code prefix matching (same rule as AAA_Platform).
"""

import streamlit as st
import pandas as pd
import io
from datetime import date

from ui.styles import inject_styles, page_header, STATUS_BG
from core.engine import build_fund_view, build_14day_forecast, latest_run_date, get_amber_buffer
from core.database import log_audit

inject_styles()
page_header("14-Day Forecast", "Projected cash positions from pipeline events")

conn = st.session_state.get("db")
if conn is None:
    st.error("Database not initialised.")
    st.stop()

run_date = latest_run_date(conn)
if not run_date:
    st.warning("No positions loaded.")
    st.stop()

# ─────────────────────────────────────────────────────────────────────────────
# Pipeline import
# ─────────────────────────────────────────────────────────────────────────────
st.subheader("Step 1: Import Pipeline Events (optional)")

with st.expander("Upload JPM Call/Distro file"):
    pipe_file = st.file_uploader(
        "JPM Call/Distribution Excel file",
        type=["xlsx", "xls"],
        key="pipe_upload",
    )

    if pipe_file is not None:
        try:
            df_raw = pd.read_excel(pipe_file)
            st.dataframe(df_raw.head(10), use_container_width=True)

            # Map common JPM pipeline columns
            col_map = {c.lower().strip(): c for c in df_raw.columns}
            fund_col   = next((col_map[k] for k in ["fund_code","fund","sub-fund"] if k in col_map), None)
            date_col   = next((col_map[k] for k in ["date","event_date","settle_date"] if k in col_map), None)
            call_col   = next((col_map[k] for k in ["call","call_amount","calls"] if k in col_map), None)
            distro_col = next((col_map[k] for k in ["distribution","distro","distro_amount"] if k in col_map), None)
            ccy_col    = next((col_map[k] for k in ["ccy","currency"] if k in col_map), None)

            if st.button("Import Pipeline Events"):
                inserted = 0
                for _, row in df_raw.iterrows():
                    fund_code = str(row[fund_col]).strip().upper() if fund_col else ""
                    evt_date  = str(row[date_col])[:10] if date_col else ""
                    call_amt  = float(row[call_col]) if call_col and pd.notna(row[call_col]) else 0.0
                    dist_amt  = float(row[distro_col]) if distro_col and pd.notna(row[distro_col]) else 0.0
                    ccy       = str(row[ccy_col]).strip().upper() if ccy_col else "USD"

                    if not fund_code or not evt_date:
                        continue

                    conn.execute(
                        """INSERT OR REPLACE INTO pipeline_events
                           (event_id, deal_name, ccy, call_amount, distro_amount, event_date, fund_code, source_file)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                        (f"{fund_code}-{evt_date}-{call_amt:.0f}", fund_code,
                         ccy, call_amt, dist_amt, evt_date, fund_code, pipe_file.name)
                    )
                    inserted += 1
                conn.commit()
                log_audit(conn, "PIPELINE_IMPORT", "pipeline_events", run_date,
                          f"File: {pipe_file.name} | Rows: {inserted}")
                st.success(f"Imported {inserted} pipeline events.")
                st.rerun()
        except Exception as e:
            st.error(f"Failed to parse pipeline file: {e}")

# ─────────────────────────────────────────────────────────────────────────────
# Forecast table
# ─────────────────────────────────────────────────────────────────────────────
st.markdown("---")
st.subheader("14-Day Forward Cash Projection")

amber_buffer = get_amber_buffer(conn)
df_fund_view = build_fund_view(conn, run_date, amber_buffer)

pipe_count = conn.execute("SELECT COUNT(*) FROM pipeline_events").fetchone()[0]
if pipe_count == 0:
    st.info("No pipeline events loaded. The forecast shows current positions only (no forward movements).")

df_forecast = build_14day_forecast(conn, df_fund_view, run_date, amber_buffer)

# Summary view: one row per fund, showing today vs. 14-day projection
if not df_forecast.empty:
    summary_rows = []
    for fund_code, group in df_forecast.groupby("fund_code"):
        last_day = group.iloc[-1]
        fund_row = df_fund_view[df_fund_view["fund_code"] == fund_code].iloc[0]
        days_red = group["days_to_red"].iloc[0]
        summary_rows.append({
            "Fund":            fund_code,
            "Today":           fund_row["cash_usd"],
            "Today Status":    fund_row["status"],
            "14-Day Projected":last_day["projected_cash"],
            "14-Day Status":   last_day["projected_status"],
            "Days to RED":     ("—" if pd.isna(days_red) else int(days_red)),
        })

    df_summary = pd.DataFrame(summary_rows)

    def _style_status_col(val):
        colors = {"RED": "#FEE2E2", "AMBER": "#FEF3C7", "GREEN": "#DCFCE7", "BLUE": "#DBEAFE"}
        bg = colors.get(str(val), "")
        return f"background-color: {bg}" if bg else ""

    styled = (
        df_summary.style
        .applymap(_style_status_col, subset=["Today Status", "14-Day Status"])
        .format({"Today": "${:,.0f}", "14-Day Projected": "${:,.0f}"})
    )
    st.dataframe(styled, use_container_width=True, hide_index=True)

    # Funds approaching RED
    funds_near_red = df_summary[df_summary["Days to RED"] != "—"]
    if not funds_near_red.empty:
        st.warning(
            f"Funds projected to reach RED in the next 14 days: "
            + ", ".join(
                f"{row['Fund']} (day {row['Days to RED']})"
                for _, row in funds_near_red.iterrows()
            )
        )

    # Day-by-day detail (collapsible)
    with st.expander("Day-by-Day Detail"):
        fund_filter = st.selectbox("Select fund", df_fund_view["fund_code"].tolist())
        df_detail = df_forecast[df_forecast["fund_code"] == fund_filter][
            ["target_date", "projected_cash", "projected_status"]
        ].copy()
        df_detail.columns = ["Date", "Projected Cash (USD)", "Status"]

        def _row_style(row):
            bg = STATUS_BG.get(row["Status"], "")
            return [f"background-color: {bg}" if bg else "" for _ in row]

        st.dataframe(
            df_detail.style.apply(_row_style, axis=1).format({"Projected Cash (USD)": "${:,.0f}"}),
            use_container_width=True, hide_index=True
        )
else:
    # Fallback: show today's position as the "forecast"
    st.dataframe(
        df_fund_view[["fund_code", "cash_usd", "cash_floor", "status"]].rename(columns={
            "fund_code": "Fund", "cash_usd": "Cash (USD)",
            "cash_floor": "Floor", "status": "Status"
        }),
        use_container_width=True, hide_index=True,
    )
