"""
Import — Upload and validate the daily JPM position file.
Dynamic column mapping handles variable column order across file versions.
"""

import streamlit as st
import pandas as pd
from datetime import date

from ui.styles import inject_styles, page_header
from core.importer import parse_position_file, validate_against_funds, commit_positions, PositionImportError
from core.database import log_audit

inject_styles()
page_header("Import Data", "Load daily JPM position file (CSV or Excel)")

conn = st.session_state.get("db")
if conn is None:
    st.error("Database not initialised. Return to the Home page.")
    st.stop()

# ─────────────────────────────────────────────────────────────────────────────
# File upload
# ─────────────────────────────────────────────────────────────────────────────
st.markdown("**Step 1: Upload position file**")
uploaded = st.file_uploader(
    "Drop the JPM daily position file here",
    type=["csv", "xlsx", "xls"],
    help="Required columns: Fund_Code, CCY, Cash_Balance_Local, Report_Date"
)

if uploaded is None:
    st.info("Awaiting file upload. Accepted formats: CSV, Excel (.xlsx, .xls)")

    # Import history
    st.markdown("---")
    st.subheader("Import History")
    df_hist = pd.read_sql(
        """SELECT run_date, detail, timestamp
           FROM audit_log WHERE action = 'IMPORT_POSITIONS'
           ORDER BY timestamp DESC LIMIT 20""",
        conn
    )
    if df_hist.empty:
        st.caption("No imports yet.")
    else:
        st.dataframe(df_hist, use_container_width=True, hide_index=True)
    st.stop()

# ─────────────────────────────────────────────────────────────────────────────
# Parse and validate
# ─────────────────────────────────────────────────────────────────────────────
try:
    df_raw, warnings = parse_position_file(uploaded, filename=uploaded.name)
except PositionImportError as e:
    st.error(f"Import failed: {e}")
    st.stop()

for w in warnings:
    st.warning(w)

# Validate fund codes
df_valid, unknown_codes = validate_against_funds(df_raw, conn)

if unknown_codes:
    st.warning(
        f"The following fund codes are not in the fund master and will be skipped: "
        f"{', '.join(unknown_codes)}"
    )

if df_valid.empty:
    st.error("No valid rows after validation. Check fund codes match the fund master.")
    st.stop()

# Determine run_date from data (use first Report_Date found)
run_date_str = df_valid["report_date"].dropna().iloc[0] if not df_valid["report_date"].dropna().empty else str(date.today())

# ─────────────────────────────────────────────────────────────────────────────
# Preview
# ─────────────────────────────────────────────────────────────────────────────
st.markdown(f"**Step 2: Review {len(df_valid)} valid rows (Report Date: {run_date_str})**")

# Check for duplicate import
existing = conn.execute(
    "SELECT COUNT(*) FROM positions WHERE run_date = ?", (run_date_str,)
).fetchone()[0]

if existing > 0:
    st.warning(
        f"Positions for {run_date_str} already exist ({existing} rows). "
        "Confirming will replace them."
    )

st.dataframe(df_valid, use_container_width=True, hide_index=True)

# Summary metrics
col1, col2, col3 = st.columns(3)
col1.metric("Total Rows", len(df_valid))
col2.metric("Funds", df_valid["fund_code"].nunique())
col3.metric("Currencies", df_valid["ccy"].nunique())

# ─────────────────────────────────────────────────────────────────────────────
# Confirm import
# ─────────────────────────────────────────────────────────────────────────────
st.markdown("**Step 3: Confirm import**")

with st.form("confirm_import"):
    st.markdown(f"Commit **{len(df_valid)} rows** for date **{run_date_str}** to the database?")
    submitted = st.form_submit_button("Confirm Import", type="primary")

if submitted:
    with st.spinner("Importing..."):
        n = commit_positions(df_valid, conn, run_date_str, source_file=uploaded.name)
    st.success(f"Imported {n} position rows for {run_date_str}.")
    st.balloons()
