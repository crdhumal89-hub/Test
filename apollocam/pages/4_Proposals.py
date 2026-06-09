"""
Proposals — Review and approve inter-fund wire transfers and spot FX conversions.
Approval decisions are written to the database immediately (not held in session).
"""

import streamlit as st
import pandas as pd
from datetime import date, datetime

from ui.styles import inject_styles, page_header, status_badge
from core.engine import (
    build_fund_view, propose_wires, propose_fx_conversions,
    save_proposals, latest_run_date, get_amber_buffer
)
from core.database import log_audit

inject_styles()
page_header("Proposals", "Wire Transfers & Spot FX Conversions")

conn = st.session_state.get("db")
if conn is None:
    st.error("Database not initialised.")
    st.stop()

run_date = latest_run_date(conn)
if not run_date:
    st.warning("No positions loaded. Go to Import Data first.")
    st.stop()

amber_buffer = get_amber_buffer(conn)
df_fund_view = build_fund_view(conn, run_date, amber_buffer)

# ─────────────────────────────────────────────────────────────────────────────
# Generate proposals (idempotent — clears PENDING and re-proposes)
# ─────────────────────────────────────────────────────────────────────────────
existing_proposals = pd.read_sql(
    "SELECT * FROM proposals WHERE run_date = ?", conn, params=[run_date]
)

col_run, col_info = st.columns([2, 5])
with col_run:
    if st.button("Run Proposals", type="primary",
                 help="Generate wire + FX proposals from current positions"):
        # Clear existing PENDING proposals for this date
        conn.execute(
            "DELETE FROM proposals WHERE run_date = ? AND action = 'PENDING'", (run_date,)
        )
        conn.commit()

        batch_id = f"B{run_date.replace('-','')}-001"
        wire_props = propose_wires(df_fund_view)
        fx_props   = propose_fx_conversions(conn, df_fund_view, run_date)

        all_proposals = wire_props + fx_props
        if all_proposals:
            save_proposals(conn, all_proposals, run_date, batch_id)
            st.success(f"Generated {len(wire_props)} wire + {len(fx_props)} FX proposals.")
            log_audit(conn, "PROPOSALS_RUN", "proposals", run_date,
                      f"Wires: {len(wire_props)} | FX: {len(fx_props)} | Batch: {batch_id}")
        else:
            st.info("No proposals generated — all funds are above floor.")
        st.rerun()

with col_info:
    st.caption(f"Run date: **{run_date}** | Positions as of latest import")

# Reload after possible run
df_props = pd.read_sql("SELECT * FROM proposals WHERE run_date = ?", conn, params=[run_date])

if df_props.empty:
    st.info("No proposals for today. Click **Run Proposals** to generate them.")
    st.stop()

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
wire_total = df_props[df_props["proposal_type"] == "WIRE"]["sell_amount"].sum()
fx_total   = df_props[df_props["proposal_type"] == "FX"]["buy_amount"].sum()
approved   = (df_props["action"] == "APPROVE").sum()

c1, c2, c3, c4 = st.columns(4)
c1.metric("Wire Proposals", len(df_props[df_props["proposal_type"] == "WIRE"]))
c2.metric("Wire Notional", f"${wire_total:,.0f}")
c3.metric("FX Proposals",  len(df_props[df_props["proposal_type"] == "FX"]))
c4.metric("Approved",      approved)

# ─────────────────────────────────────────────────────────────────────────────
# Batch approve all wires
# ─────────────────────────────────────────────────────────────────────────────
pending_wire_ids = df_props[
    (df_props["proposal_type"] == "WIRE") & (df_props["action"] == "PENDING")
]["id"].tolist()

if pending_wire_ids:
    if st.button(f"Approve All {len(pending_wire_ids)} Wire(s)", help="Alt+A"):
        placeholders = ",".join("?" * len(pending_wire_ids))
        conn.execute(
            f"UPDATE proposals SET action='APPROVE', approved_at=? WHERE id IN ({placeholders})",
            [datetime.utcnow().isoformat()] + pending_wire_ids
        )
        conn.commit()
        log_audit(conn, "WIRE_APPROVE_ALL", "proposals", run_date,
                  f"Bulk approved {len(pending_wire_ids)} wires")
        st.toast(f"Approved {len(pending_wire_ids)} wire proposals", icon="✅")
        st.rerun()

st.markdown("---")

# ─────────────────────────────────────────────────────────────────────────────
# Wire Transfer Proposals
# ─────────────────────────────────────────────────────────────────────────────
wire_df = df_props[df_props["proposal_type"] == "WIRE"].sort_values("priority")

if not wire_df.empty:
    st.subheader("Wire Transfer Proposals")

    for _, prop in wire_df.iterrows():
        pid = int(prop["id"])
        from_fund = prop["from_fund"]
        to_fund   = prop["to_fund"]
        amount    = prop["sell_amount"]
        current_action = prop["action"]

        # Get source/target balances for context
        src_row = df_fund_view[df_fund_view["fund_code"] == from_fund]
        tgt_row = df_fund_view[df_fund_view["fund_code"] == to_fund]
        src_cash = src_row["cash_usd"].iloc[0] if not src_row.empty else 0
        tgt_cash = tgt_row["cash_usd"].iloc[0] if not tgt_row.empty else 0
        tgt_floor = tgt_row["cash_floor"].iloc[0] if not tgt_row.empty else 0

        border_color = {"APPROVE": "#007D55", "SKIP": "#DC2626",
                        "HOLD": "#92400E", "PENDING": "#CBD5E1"}.get(current_action, "#CBD5E1")

        with st.container(border=True):
            col_info, col_action = st.columns([3, 1])
            with col_info:
                st.markdown(
                    f"**Priority {int(prop['priority'])}:** "
                    f"`{from_fund}` → `{to_fund}` &nbsp; "
                    f"**${amount:,.0f}**",
                    unsafe_allow_html=True
                )
                st.caption(
                    f"Source balance: ${src_cash:,.0f} | "
                    f"Target current: ${tgt_cash:,.0f} → after wire: ${tgt_cash+amount:,.0f} "
                    f"(floor: ${tgt_floor:,.0f})"
                )

            with col_action:
                action_key = f"wire_action_{pid}"
                choice = st.selectbox(
                    "Decision",
                    ["PENDING", "APPROVE", "SKIP", "HOLD"],
                    index=["PENDING", "APPROVE", "SKIP", "HOLD"].index(current_action),
                    key=action_key,
                    label_visibility="collapsed",
                )
                if choice != current_action:
                    conn.execute(
                        "UPDATE proposals SET action=?, approved_at=? WHERE id=?",
                        (choice, datetime.utcnow().isoformat() if choice == "APPROVE" else None, pid)
                    )
                    conn.commit()
                    log_audit(conn, f"WIRE_{choice}", "proposals", str(pid),
                              f"{from_fund} → {to_fund} ${amount:,.0f} | {current_action} → {choice}")
                    st.rerun()

# ─────────────────────────────────────────────────────────────────────────────
# Spot FX Proposals
# ─────────────────────────────────────────────────────────────────────────────
fx_df = df_props[df_props["proposal_type"] == "FX"].sort_values("priority")

if not fx_df.empty:
    st.markdown("---")
    st.subheader("Spot FX Conversion Proposals")

    for _, prop in fx_df.iterrows():
        pid          = int(prop["id"])
        fund_code    = prop["from_fund"]
        sell_ccy     = prop["sell_ccy"]
        sell_amount  = prop["sell_amount"]
        buy_amount   = prop["buy_amount"] or 0
        fx_rate      = prop["fx_rate"] or 0
        value_date   = prop["value_date"] or ""
        current_action = prop["action"]

        with st.container(border=True):
            col_info, col_action = st.columns([3, 1])
            with col_info:
                st.markdown(
                    f"**{fund_code}:** Sell **{sell_ccy} {sell_amount:,.0f}** → "
                    f"Buy **USD {buy_amount:,.0f}**",
                )
                st.caption(
                    f"Rate: {fx_rate:.4f} | Value date: {value_date}"
                )
            with col_action:
                action_key = f"fx_action_{pid}"
                choice = st.selectbox(
                    "Decision",
                    ["PENDING", "APPROVE", "SKIP", "HOLD"],
                    index=["PENDING", "APPROVE", "SKIP", "HOLD"].index(current_action),
                    key=action_key,
                    label_visibility="collapsed",
                )
                if choice != current_action:
                    conn.execute(
                        "UPDATE proposals SET action=?, approved_at=? WHERE id=?",
                        (choice, datetime.utcnow().isoformat() if choice == "APPROVE" else None, pid)
                    )
                    conn.commit()
                    log_audit(conn, f"FX_{choice}", "proposals", str(pid),
                              f"{fund_code} sell {sell_ccy} {sell_amount:,.0f} | "
                              f"{current_action} → {choice}")
                    st.rerun()

# ─────────────────────────────────────────────────────────────────────────────
# Post-approval position preview
# ─────────────────────────────────────────────────────────────────────────────
approved_wires = df_props[
    (df_props["proposal_type"] == "WIRE") & (df_props["action"] == "APPROVE")
]

if not approved_wires.empty:
    st.markdown("---")
    with st.expander("Post-Transfer Position Preview", expanded=False):
        st.caption("Simulated positions after all approved wires are executed.")

        working = dict(zip(df_fund_view["fund_code"], df_fund_view["cash_usd"]))
        for _, w in approved_wires.iterrows():
            working[w["from_fund"]] = working.get(w["from_fund"], 0) - w["sell_amount"]
            working[w["to_fund"]]   = working.get(w["to_fund"],   0) + w["sell_amount"]

        rows = []
        for _, fund in df_fund_view.iterrows():
            new_cash = working.get(fund["fund_code"], fund["cash_usd"])
            rows.append({
                "Fund":          fund["fund_code"],
                "Before Wire":   fund["cash_usd"],
                "After Wire":    new_cash,
                "Floor":         fund["cash_floor"],
                "New Status":    (lambda c, f, ceil, ab: (
                    "RED" if c < f else "AMBER" if c < f*ab else "GREEN" if c <= ceil else "BLUE"
                ))(new_cash, fund["cash_floor"], fund["cash_ceiling"], amber_buffer)
            })

        df_preview = pd.DataFrame(rows)
        st.dataframe(df_preview.style.format({
            "Before Wire": "${:,.0f}",
            "After Wire":  "${:,.0f}",
            "Floor":       "${:,.0f}",
        }), hide_index=True, use_container_width=True)
