"""
ApolloCAM Phase 2 — Streamlit Application Entry Point
Apollo Global Management · Mumbai · Fund Controllership

Run: streamlit run app.py
"""

import streamlit as st

# Page config must be the first Streamlit call
st.set_page_config(
    page_title="ApolloCAM",
    page_icon="💵",
    layout="wide",
    initial_sidebar_state="expanded",
    menu_items={
        "Get help": None,
        "Report a bug": None,
        "About": "ApolloCAM — Apollo Cash Automation & Management\nApollo Global Management, Mumbai",
    },
)

from ui.styles import inject_styles, NAVY, GOLD
from core.database import get_connection, init_db

# ─────────────────────────────────────────────────────────────────────────────
# One-time initialisation (runs on every cold start, idempotent)
# ─────────────────────────────────────────────────────────────────────────────

@st.cache_resource
def _get_db():
    """Shared SQLite connection — one instance for the entire Streamlit process."""
    conn = get_connection()
    init_db(conn)
    return conn


# Make connection available to all pages via session state
if "db" not in st.session_state:
    st.session_state["db"] = _get_db()

inject_styles()

# ─────────────────────────────────────────────────────────────────────────────
# Sidebar
# ─────────────────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown(
        f"""
        <div style="background:{NAVY};padding:16px 12px 12px 12px;border-radius:6px;
                    margin-bottom:1rem;">
          <div style="color:{GOLD};font-size:1.1rem;font-weight:bold;
                      letter-spacing:0.05em;">ApolloCAM</div>
          <div style="color:#94A3B8;font-size:0.75rem;margin-top:2px;">
            Apollo Cash Automation & Management
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # Latest run date indicator
    conn = st.session_state["db"]
    row = conn.execute("SELECT MAX(run_date) FROM positions").fetchone()
    run_date = row[0] if row and row[0] else None

    if run_date:
        st.caption(f"Data as of: **{run_date}**")
    else:
        st.warning("No positions loaded yet. Use the Import page to load today's file.")

    st.markdown("---")
    st.caption("Navigation")
    st.page_link("pages/1_Dashboard.py",    label="Dashboard",     icon="🏠")
    st.page_link("pages/2_Import.py",       label="Import Data",   icon="📥")
    st.page_link("pages/3_Status_Review.py",label="Status Review", icon="🔍")
    st.page_link("pages/4_Proposals.py",    label="Proposals",     icon="⚡")
    st.page_link("pages/5_Loaders.py",      label="Loaders",       icon="📤")
    st.page_link("pages/6_Forecast.py",     label="14-Day Forecast", icon="📈")
    st.page_link("pages/7_Wire_Status.py",  label="Wire Status",   icon="🔗")
    st.page_link("pages/8_Audit_Log.py",    label="Audit Log",     icon="📋")
    st.page_link("pages/9_Settings.py",     label="Settings",      icon="⚙️")

    st.markdown("---")
    st.caption("ApolloCAM v2 · June 2026")

# ─────────────────────────────────────────────────────────────────────────────
# Home content (shown when the user opens the root URL)
# ─────────────────────────────────────────────────────────────────────────────
from ui.styles import page_header
from core.engine import build_fund_view, status_summary, latest_run_date, get_amber_buffer, RED

page_header(
    "ApolloCAM — Daily Cash Management",
    "Apollo Global Management · Fund Controllership · Mumbai"
)

# Quick-status overview on the home page
run_date = latest_run_date(conn)

if run_date:
    amber_buffer = get_amber_buffer(conn)
    df = build_fund_view(conn, run_date, amber_buffer)
    summary = status_summary(df)

    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.metric("RED Funds", summary["RED"],
                  delta=None if summary["RED"] == 0 else "Action Required",
                  delta_color="inverse")
    with c2:
        st.metric("AMBER Funds", summary["AMBER"])
    with c3:
        st.metric("GREEN Funds", summary["GREEN"])
    with c4:
        st.metric("BLUE (Excess)", summary["BLUE"])

    if summary["RED"] > 0:
        red_names = df[df["status"] == RED]["fund_code"].tolist()
        st.error(f"RED funds require attention: {', '.join(red_names)}")

    st.info("Use the sidebar to navigate to Dashboard, Proposals, or Loaders.")
else:
    st.info("Welcome to ApolloCAM. Load today's JPM position file using the **Import Data** page.")
    st.markdown("""
    ### Quick Start
    1. **Import Data** — Upload the JPM daily position CSV/Excel file
    2. **Dashboard** — See the 11-fund status overview
    3. **Proposals** — Approve wire transfers and spot FX conversions
    4. **Loaders** — Generate and download IVP/Trade/SpotFX loader files
    5. **14-Day Forecast** — Import pipeline file to see projected fund positions
    """)
