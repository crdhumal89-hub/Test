"""
Loaders — Generate and download IVP wire, trade booking, and spot FX loader files.
All files are values-only Excel/CSV — no formulas, safe for IVP submission.
"""

import streamlit as st
import pandas as pd
import zipfile
import io

from ui.styles import inject_styles, page_header
from core.loader_gen import (
    generate_ivp_loader, generate_trade_loader, generate_spot_fx_loader
)
from core.engine import latest_run_date
from core.database import log_audit

inject_styles()
page_header("Loaders", "Generate IVP, Trade Booking, and Spot FX loader files")

conn = st.session_state.get("db")
if conn is None:
    st.error("Database not initialised.")
    st.stop()

run_date = latest_run_date(conn)
if not run_date:
    st.warning("No positions loaded.")
    st.stop()

# Check for approved proposals
approved_wires = conn.execute(
    "SELECT COUNT(*) FROM proposals WHERE run_date=? AND proposal_type='WIRE' AND action='APPROVE'",
    (run_date,)
).fetchone()[0]

approved_fx = conn.execute(
    "SELECT COUNT(*) FROM proposals WHERE run_date=? AND proposal_type='FX' AND action='APPROVE'",
    (run_date,)
).fetchone()[0]

if approved_wires == 0 and approved_fx == 0:
    st.warning("No approved proposals found. Go to **Proposals** to approve wire or FX proposals first.")
    st.stop()

st.markdown(
    f"**{approved_wires}** approved wire(s) · **{approved_fx}** approved FX conversion(s) · "
    f"Run date: **{run_date}**"
)

# ─────────────────────────────────────────────────────────────────────────────
# Generate all loaders
# ─────────────────────────────────────────────────────────────────────────────
if "loaders" not in st.session_state:
    st.session_state["loaders"] = {}

col_gen, col_zip = st.columns([2, 2])
with col_gen:
    if st.button("Generate All Loaders", type="primary"):
        with st.spinner("Generating loader files..."):
            ivp_buf, ivp_rows, ivp_hash = generate_ivp_loader(conn, run_date)
            trade_buf, trade_rows, trade_hash = generate_trade_loader(conn, run_date)
            spot_buf, spot_rows, spot_hash = generate_spot_fx_loader(conn, run_date)

        st.session_state["loaders"] = {
            "ivp":   (ivp_buf,   ivp_rows,   ivp_hash),
            "trade": (trade_buf, trade_rows, trade_hash),
            "spot":  (spot_buf,  spot_rows,  spot_hash),
        }
        st.toast("Loader files generated", icon="✅")
        st.rerun()

with col_zip:
    if st.session_state["loaders"]:
        # Build ZIP in memory
        zip_buf = io.BytesIO()
        batch = f"B{run_date.replace('-','')}-001"
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            ivp_b, _, _   = st.session_state["loaders"]["ivp"]
            trade_b, _, _ = st.session_state["loaders"]["trade"]
            spot_b, _, _  = st.session_state["loaders"]["spot"]
            ivp_b.seek(0); trade_b.seek(0); spot_b.seek(0)
            zf.writestr(f"IVP_{batch}.xlsx",      ivp_b.read())
            zf.writestr(f"Trade_{batch}.csv",     trade_b.read())
            zf.writestr(f"SpotFX_{batch}.xlsx",   spot_b.read())
        zip_buf.seek(0)

        st.download_button(
            "Download All (ZIP)",
            data=zip_buf,
            file_name=f"ApolloCAM_Loaders_{run_date}.zip",
            mime="application/zip",
        )

st.markdown("---")

# ─────────────────────────────────────────────────────────────────────────────
# Individual loader sections
# ─────────────────────────────────────────────────────────────────────────────
tab1, tab2, tab3 = st.tabs(["IVP Wire Loader", "Trade Booking Loader", "Spot FX Loader"])

loaders = st.session_state.get("loaders", {})

def _loader_section(tab, key: str, label: str, loader_type: str,
                    file_ext: str, mime: str):
    with tab:
        if key in loaders:
            buf, n_rows, file_hash = loaders[key]
            col_dl, col_meta = st.columns([2, 3])
            with col_dl:
                buf.seek(0)
                batch = f"B{run_date.replace('-','')}-001"
                st.download_button(
                    f"Download {label}",
                    data=buf.read(),
                    file_name=f"{loader_type}_{batch}.{file_ext}",
                    mime=mime,
                )
            with col_meta:
                st.markdown(f"**{n_rows} rows** · hash: `{file_hash}`")
                st.caption(f"Run date: {run_date}")

            # Preview
            try:
                buf.seek(0)
                if file_ext == "xlsx":
                    df_preview = pd.read_excel(buf)
                else:
                    buf.seek(0)
                    df_preview = pd.read_csv(buf)
                st.dataframe(df_preview, use_container_width=True, hide_index=True)
            except Exception:
                st.caption("Preview unavailable.")
        else:
            st.info(f"Click **Generate All Loaders** above to create the {label}.")

_loader_section(tab1, "ivp",   "IVP Wire Loader",       "IVP",   "xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
_loader_section(tab2, "trade", "Trade Booking Loader",   "Trade", "csv", "text/csv")
_loader_section(tab3, "spot",  "Spot FX Loader",         "SpotFX","xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
