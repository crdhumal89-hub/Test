"""
Wire Status Tracker — lifecycle kanban for each wire from proposal to confirmation.
Statuses: PROPOSED → APPROVED → LOADER_GENERATED → SUBMITTED → CONFIRMED
"""

import streamlit as st
import pandas as pd
from datetime import datetime

from ui.styles import inject_styles, page_header
from core.engine import latest_run_date
from core.database import log_audit

inject_styles()
page_header("Wire Status", "Track inter-fund wire lifecycle")

conn = st.session_state.get("db")
if conn is None:
    st.error("Database not initialised.")
    st.stop()

run_date = latest_run_date(conn)

# Filter controls
col_date, col_fund = st.columns(2)
with col_date:
    filter_date = st.date_input("Date filter", value=None, help="Leave blank for all dates")
with col_fund:
    fund_codes = [r[0] for r in conn.execute(
        "SELECT DISTINCT fund_code FROM funds WHERE active=1 ORDER BY fund_code"
    ).fetchall()]
    filter_fund = st.selectbox("Fund filter", ["All"] + fund_codes)

# Load wire status data
query = """
    SELECT ws.id, ws.proposal_id, ws.batch_id, ws.wire_reference,
           ws.status, ws.confirmation_ref, ws.submitted_at, ws.confirmed_at,
           ws.notes, ws.updated_at,
           p.from_fund, p.to_fund, p.sell_amount, p.sell_ccy, p.run_date
    FROM wire_status ws
    JOIN proposals p ON p.id = ws.proposal_id
    WHERE 1=1
"""
params = []
if filter_date:
    query += " AND p.run_date = ?"
    params.append(str(filter_date))
if filter_fund != "All":
    query += " AND (p.from_fund = ? OR p.to_fund = ?)"
    params.extend([filter_fund, filter_fund])
query += " ORDER BY ws.updated_at DESC"

df_status = pd.read_sql(query, conn, params=params)

if df_status.empty:
    st.info("No wire status records found. Generate and approve proposals to track wires here.")
    st.stop()

# ─────────────────────────────────────────────────────────────────────────────
# Kanban columns
# ─────────────────────────────────────────────────────────────────────────────
STATUS_ORDER = ["PROPOSED", "APPROVED", "LOADER_GENERATED", "SUBMITTED", "CONFIRMED"]
STATUS_LABELS = {
    "PROPOSED":         "1. Proposed",
    "APPROVED":         "2. Approved",
    "LOADER_GENERATED": "3. Loader Generated",
    "SUBMITTED":        "4. Submitted to IVP",
    "CONFIRMED":        "5. Confirmed",
}

st.markdown("---")
kanban_cols = st.columns(5)

for col, status in zip(kanban_cols, STATUS_ORDER):
    col_wires = df_status[df_status["status"] == status]
    with col:
        st.markdown(f"**{STATUS_LABELS[status]}**")
        st.caption(f"{len(col_wires)} wire(s)")
        for _, wire in col_wires.iterrows():
            with st.container(border=True):
                st.markdown(
                    f"`{wire['from_fund']}` → `{wire['to_fund']}`\n\n"
                    f"**${wire['sell_amount']:,.0f}** {wire['sell_ccy']}"
                )
                st.caption(f"Date: {wire['run_date']}")
                if wire['confirmation_ref']:
                    st.caption(f"Ref: {wire['confirmation_ref']}")

st.markdown("---")

# ─────────────────────────────────────────────────────────────────────────────
# Status update form
# ─────────────────────────────────────────────────────────────────────────────
st.subheader("Update Wire Status")

wire_options = {
    f"{r['from_fund']} → {r['to_fund']} ${r['sell_amount']:,.0f} ({r['run_date']})": int(r["id"])
    for _, r in df_status.iterrows()
}

selected_wire_label = st.selectbox("Select wire to update", list(wire_options.keys()))
selected_wire_id = wire_options[selected_wire_label]
current_wire = df_status[df_status["id"] == selected_wire_id].iloc[0]

with st.form("wire_status_update"):
    new_status = st.selectbox(
        "New Status",
        STATUS_ORDER,
        index=STATUS_ORDER.index(current_wire["status"]),
    )

    confirmation_ref = st.text_input(
        "Confirmation Reference",
        value=current_wire["confirmation_ref"] or "",
        placeholder="Wire confirmation number from IVP / bank",
        disabled=(new_status != "CONFIRMED"),
    )

    notes = st.text_area(
        "Notes",
        value=current_wire["notes"] or "",
        height=80,
    )

    submitted = st.form_submit_button("Update Status", type="primary")

if submitted:
    now = datetime.utcnow().isoformat()
    conn.execute(
        """UPDATE wire_status
           SET status=?, confirmation_ref=?, notes=?, updated_at=?,
               submitted_at=CASE WHEN ? = 'SUBMITTED' THEN ? ELSE submitted_at END,
               confirmed_at=CASE WHEN ? = 'CONFIRMED' THEN ? ELSE confirmed_at END
           WHERE id=?""",
        (new_status, confirmation_ref or None, notes or None, now,
         new_status, now, new_status, now,
         selected_wire_id)
    )
    conn.commit()
    log_audit(conn, "WIRE_STATUS_UPDATE", "wire_status", str(selected_wire_id),
              f"Status: {current_wire['status']} → {new_status} | Ref: {confirmation_ref}")
    st.toast(f"Wire status updated to {new_status}", icon="✅")
    st.rerun()

# Export
st.markdown("---")
csv = df_status.to_csv(index=False).encode()
st.download_button(
    "Export Wire Status (CSV)",
    data=csv,
    file_name=f"wire_status_{run_date or 'all'}.csv",
    mime="text/csv",
)
