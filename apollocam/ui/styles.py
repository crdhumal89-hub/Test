"""
Apollo design system — CSS injected into Streamlit via st.markdown.
Matches ApolloCAM.xlsx colour palette exactly.
"""

# Apollo colour palette (hex without #)
NAVY    = "#0F2744"
NAVY2   = "#1E3A5F"
NAVY3   = "#162035"
GREEN   = "#053520"
AGREEN  = "#007D55"
MGREEN  = "#DCFCE7"
AMBER   = "#92400E"
LAMBER  = "#FEF3C7"
RED     = "#991B1B"
DRED    = "#DC2626"
LRED    = "#FEE2E2"
BLUE    = "#1E40AF"
LBLUE   = "#DBEAFE"
PURPLE  = "#6D28D9"
LPURP   = "#F5F3FF"
GOLD    = "#F59E0B"
SLATE   = "#1E293B"
SLATE2  = "#475569"
SLATE3  = "#94A3B8"
LGRAY   = "#F1F5F9"
WHITE   = "#FFFFFF"
OFFWHT  = "#F8FAFC"

STATUS_BG = {
    "RED":   LRED,
    "AMBER": LAMBER,
    "GREEN": MGREEN,
    "BLUE":  LBLUE,
}
STATUS_FG = {
    "RED":   RED,
    "AMBER": AMBER,
    "GREEN": AGREEN,
    "BLUE":  BLUE,
}

GLOBAL_CSS = """
<style>
/* ── Typography ────────────────────────────────────────────────────── */
html, body, [class*="css"] {
    font-family: Calibri, 'Segoe UI', 'Helvetica Neue', sans-serif;
    color: #1E293B;
}

/* ── Hide default Streamlit hamburger + footer ──────────────────────── */
#MainMenu {visibility: hidden;}
footer {visibility: hidden;}

/* ── Sidebar ────────────────────────────────────────────────────────── */
[data-testid="stSidebar"] {
    background: #0F2744;
}
[data-testid="stSidebar"] * {
    color: #F8FAFC !important;
}
[data-testid="stSidebar"] [data-testid="stMarkdownContainer"] h1,
[data-testid="stSidebar"] [data-testid="stMarkdownContainer"] h2,
[data-testid="stSidebar"] [data-testid="stMarkdownContainer"] h3 {
    color: #F59E0B !important;
}

/* ── Page title bar ─────────────────────────────────────────────────── */
.apollo-header {
    background: #0F2744;
    color: #FFFFFF;
    padding: 14px 20px 10px 20px;
    border-radius: 6px;
    margin-bottom: 1rem;
}
.apollo-header h1 {
    color: #FFFFFF;
    font-size: 1.4rem;
    font-weight: bold;
    margin: 0 0 2px 0;
}
.apollo-header .subtitle {
    color: #94A3B8;
    font-size: 0.8rem;
}

/* ── Status badges ───────────────────────────────────────────────────── */
.badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 12px;
    font-weight: bold;
    font-size: 0.8rem;
    line-height: 1.6;
}
.badge-RED   { background: #FEE2E2; color: #991B1B; }
.badge-AMBER { background: #FEF3C7; color: #92400E; }
.badge-GREEN { background: #DCFCE7; color: #007D55; }
.badge-BLUE  { background: #DBEAFE; color: #1E40AF; }

/* ── KPI cards ───────────────────────────────────────────────────────── */
.kpi-card {
    background: #FFFFFF;
    border-left: 4px solid #1E3A5F;
    border-radius: 4px;
    padding: 12px 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.kpi-card.red   { border-left-color: #DC2626; }
.kpi-card.amber { border-left-color: #F59E0B; }
.kpi-card.green { border-left-color: #007D55; }
.kpi-card.blue  { border-left-color: #1E40AF; }
.kpi-card .label { font-size: 0.75rem; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em; }
.kpi-card .value { font-size: 1.5rem; font-weight: bold; color: #1E293B; margin-top: 2px; }

/* ── Fund status table rows ─────────────────────────────────────────── */
.row-RED   { background: #FEE2E2 !important; }
.row-AMBER { background: #FEF3C7 !important; }
.row-GREEN { background: #DCFCE7 !important; }
.row-BLUE  { background: #DBEAFE !important; }

/* ── Proposal cards ─────────────────────────────────────────────────── */
.proposal-card {
    border: 1px solid #E2E8F0;
    border-radius: 6px;
    padding: 12px 16px;
    margin-bottom: 10px;
    background: #FFFFFF;
}
.proposal-card.wire { border-left: 4px solid #DC2626; }
.proposal-card.fx   { border-left: 4px solid #6D28D9; }

/* ── Buttons ─────────────────────────────────────────────────────────── */
.stButton > button[kind="primary"] {
    background: #007D55;
    color: white;
    border: none;
    font-weight: bold;
}
.stButton > button[kind="primary"]:hover {
    background: #005C40;
}

/* ── Alert banner ───────────────────────────────────────────────────── */
.apollo-alert {
    background: #FEE2E2;
    border: 1px solid #DC2626;
    border-radius: 4px;
    padding: 10px 16px;
    color: #991B1B;
    font-weight: bold;
    margin-bottom: 1rem;
}

/* ── Mobile responsiveness ───────────────────────────────────────────── */
@media (max-width: 768px) {
    .apollo-header h1 { font-size: 1.1rem; }
    .kpi-card .value  { font-size: 1.2rem; }
    /* Proposals: larger touch targets */
    .stRadio label { font-size: 1rem; padding: 8px 0; }
    .stButton > button { min-height: 44px; font-size: 1rem; }
}
</style>
"""


def inject_styles() -> None:
    """Call once per page to inject Apollo design system CSS."""
    import streamlit as st
    st.markdown(GLOBAL_CSS, unsafe_allow_html=True)


def page_header(title: str, subtitle: str = "") -> None:
    """Render an Apollo-branded page title bar."""
    import streamlit as st
    sub_html = f'<div class="subtitle">{subtitle}</div>' if subtitle else ""
    st.markdown(
        f'<div class="apollo-header"><h1>{title}</h1>{sub_html}</div>',
        unsafe_allow_html=True,
    )


def status_badge(status: str) -> str:
    """Return inline HTML for a coloured status badge."""
    return f'<span class="badge badge-{status}">{status}</span>'
