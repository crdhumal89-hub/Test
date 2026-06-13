"""
Loader file generation — produces IVP wire loader, trade booking loader,
and spot FX loader as openpyxl BytesIO objects ready for st.download_button.

All files are values-only (no formulas). Column schemas match the exact
headers expected by IVP and trade booking systems.
Column names and structure mirror the LOADERS sheet in ApolloCAM.xlsx.
"""

from __future__ import annotations
import io
import sqlite3
import hashlib
from datetime import date, timedelta

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils.dataframe import dataframe_to_rows

from .database import log_audit
from .engine import _get_setting, _workday, _load_holidays


# Apollo colour constants
NAVY2  = "1E3A5F"
OFFWHT = "F8FAFC"
WHITE  = "FFFFFF"
SLATE  = "475569"

# ─────────────────────────────────────────────────────────────────────────────
# IVP WIRE LOADER
# ─────────────────────────────────────────────────────────────────────────────

IVP_COLUMNS = [
    "Sender_Account", "Sender_Bank", "Sender_BIC", "Sender_Entity",
    "Receiver_Account", "Receiver_Bank", "Receiver_BIC", "Receiver_Entity",
    "Amount", "CCY", "Value_Date", "Reference", "Narrative", "Batch_ID",
]


def generate_ivp_loader(conn: sqlite3.Connection, run_date: str) -> tuple[io.BytesIO, int, str]:
    """
    Generate IVP wire loader for all APPROVE-actioned WIRE proposals on run_date.
    Returns (BytesIO, row_count, sha256_hash).
    """
    df_proposals = pd.read_sql(
        """SELECT p.id, p.batch_id, p.from_fund, p.to_fund, p.sell_amount, p.sell_ccy,
                  p.priority,
                  f1.ssi_account AS sender_acct, f1.ssi_bank AS sender_bank,
                  f1.ssi_bic AS sender_bic, f1.ssi_entity AS sender_entity,
                  f2.ssi_account AS recv_acct, f2.ssi_bank AS recv_bank,
                  f2.ssi_bic AS recv_bic, f2.ssi_entity AS recv_entity
           FROM proposals p
           JOIN funds f1 ON f1.fund_code = p.from_fund
           JOIN funds f2 ON f2.fund_code = p.to_fund
           WHERE p.run_date = ? AND p.proposal_type = 'WIRE' AND p.action = 'APPROVE'
           ORDER BY p.priority""",
        conn, params=[run_date]
    )

    if df_proposals.empty:
        return _empty_xlsx(IVP_COLUMNS, "IVP_Wire_Loader"), 0, ""

    holidays = _load_holidays(conn)
    value_date = str(_workday(date.fromisoformat(run_date), 0, holidays))
    batch_id = df_proposals["batch_id"].iloc[0] or f"B{run_date.replace('-','')}-001"

    rows = []
    for i, row in df_proposals.iterrows():
        ref = f"ACAM-{run_date.replace('-','')}-{int(row['priority']):03d}"
        narrative = f"Inter-fund transfer: {row['from_fund']} to {row['to_fund']}"
        rows.append({
            "Sender_Account":   row["sender_acct"],
            "Sender_Bank":      row["sender_bank"],
            "Sender_BIC":       row["sender_bic"],
            "Sender_Entity":    row["sender_entity"],
            "Receiver_Account": row["recv_acct"],
            "Receiver_Bank":    row["recv_bank"],
            "Receiver_BIC":     row["recv_bic"],
            "Receiver_Entity":  row["recv_entity"],
            "Amount":           row["sell_amount"],
            "CCY":              row["sell_ccy"],
            "Value_Date":       value_date,
            "Reference":        ref,
            "Narrative":        narrative,
            "Batch_ID":         batch_id,
        })

    df_out = pd.DataFrame(rows, columns=IVP_COLUMNS)
    buf = _df_to_xlsx(df_out, sheet_name="IVP_Wire_Loader", run_date=run_date)
    file_hash = _sha256(buf)

    # Update wire_status first, then audit — so audit reflects committed state.
    # Only advance forward from PROPOSED/APPROVED — never drag a wire that has
    # already reached SUBMITTED/CONFIRMED back to LOADER_GENERATED on a re-run.
    for _, row in df_proposals.iterrows():
        conn.execute(
            "UPDATE wire_status SET status='LOADER_GENERATED', "
            "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
            "WHERE proposal_id = ? AND status IN ('PROPOSED','APPROVED')",
            (int(row["id"]),)
        )
    conn.commit()
    log_audit(conn, "LOADER_GENERATE", "ivp", batch_id,
              f"IVP loader: {len(rows)} rows | Batch: {batch_id}")

    return buf, len(rows), file_hash


# ─────────────────────────────────────────────────────────────────────────────
# TRADE BOOKING LOADER
# ─────────────────────────────────────────────────────────────────────────────

TRADE_COLUMNS = [
    "Trade_Date", "Settle_Date", "Fund_Code", "Dr_Cr", "Amount", "CCY",
    "Account", "GL_Account", "Counterparty", "Reference", "Cost_Centre", "Narrative",
]


def generate_trade_loader(conn: sqlite3.Connection, run_date: str) -> tuple[io.BytesIO, int, str]:
    """
    Two rows per approved wire (debit + credit legs), matching LOADERS Trade section.
    Returns a UTF-8 CSV BytesIO (not XLSX) — trade booking systems consume CSV.
    """
    df_proposals = pd.read_sql(
        """SELECT p.id, p.batch_id, p.from_fund, p.to_fund, p.sell_amount, p.sell_ccy,
                  p.priority,
                  f1.ssi_account AS from_acct,
                  f2.ssi_account AS to_acct
           FROM proposals p
           JOIN funds f1 ON f1.fund_code = p.from_fund
           JOIN funds f2 ON f2.fund_code = p.to_fund
           WHERE p.run_date = ? AND p.proposal_type = 'WIRE' AND p.action = 'APPROVE'
           ORDER BY p.priority""",
        conn, params=[run_date]
    )

    if df_proposals.empty:
        return _empty_csv(TRADE_COLUMNS), 0, ""

    holidays = _load_holidays(conn)
    settle_date = str(_workday(date.fromisoformat(run_date), 0, holidays))
    batch_id = df_proposals["batch_id"].iloc[0] or f"B{run_date.replace('-','')}-001"

    rows = []
    for _, row in df_proposals.iterrows():
        ref = f"ACAM-{run_date.replace('-','')}-{int(row['priority']):03d}"
        # Debit leg: money leaves source fund
        rows.append({
            "Trade_Date":   run_date,
            "Settle_Date":  settle_date,
            "Fund_Code":    row["from_fund"],
            "Dr_Cr":        "DR",
            "Amount":       row["sell_amount"],
            "CCY":          row["sell_ccy"],
            "Account":      row["from_acct"],
            "GL_Account":   "1010-CASH",
            "Counterparty": row["to_fund"],
            "Reference":    ref,
            "Cost_Centre":  "MUM-TREASURY",
            "Narrative":    f"InterFund transfer to {row['to_fund']}",
        })
        # Credit leg: money arrives at target fund
        rows.append({
            "Trade_Date":   run_date,
            "Settle_Date":  settle_date,
            "Fund_Code":    row["to_fund"],
            "Dr_Cr":        "CR",
            "Amount":       row["sell_amount"],
            "CCY":          row["sell_ccy"],
            "Account":      row["to_acct"],
            "GL_Account":   "1010-CASH",
            "Counterparty": row["from_fund"],
            "Reference":    ref,
            "Cost_Centre":  "MUM-TREASURY",
            "Narrative":    f"InterFund receipt from {row['from_fund']}",
        })

    df_out = pd.DataFrame(rows, columns=TRADE_COLUMNS)
    buf = io.BytesIO()
    buf.write(df_out.to_csv(index=False).encode("utf-8"))
    buf.seek(0)
    file_hash = _sha256(buf)

    log_audit(conn, "LOADER_GENERATE", "trade", batch_id,
              f"Trade loader: {len(rows)} rows ({len(rows)//2} wires) | Batch: {batch_id}")

    return buf, len(rows), file_hash


# ─────────────────────────────────────────────────────────────────────────────
# SPOT FX LOADER
# ─────────────────────────────────────────────────────────────────────────────

SPOT_FX_COLUMNS = [
    "Fund", "Trade_Date", "Value_Date", "Sell_CCY", "Sell_Amount",
    "Buy_CCY", "Buy_Amount_USD", "Ind_Rate", "Counterparty", "Reference", "Narrative",
]


def generate_spot_fx_loader(conn: sqlite3.Connection, run_date: str) -> tuple[io.BytesIO, int, str]:
    """
    One row per approved FX proposal, matching LOADERS Spot FX section.
    """
    # Use correlated subqueries (not a JOIN) so duplicate (fund, currency)
    # threshold rows can never fan a single FX proposal into multiple loader rows.
    df_proposals = pd.read_sql(
        """SELECT p.id, p.batch_id, p.from_fund, p.sell_ccy, p.sell_amount,
                  p.buy_ccy, p.buy_amount, p.fx_rate, p.value_date, p.priority,
                  (SELECT ft.fx_counterparty FROM fx_thresholds ft
                     WHERE ft.fund_code = p.from_fund AND ft.currency = p.sell_ccy
                     LIMIT 1) AS fx_counterparty,
                  (SELECT ft.settlement_acct FROM fx_thresholds ft
                     WHERE ft.fund_code = p.from_fund AND ft.currency = p.sell_ccy
                     LIMIT 1) AS settlement_acct
           FROM proposals p
           WHERE p.run_date = ? AND p.proposal_type = 'FX' AND p.action = 'APPROVE'
           ORDER BY p.priority""",
        conn, params=[run_date]
    )

    if df_proposals.empty:
        return _empty_xlsx(SPOT_FX_COLUMNS, "SpotFX_Loader"), 0, ""

    batch_id = df_proposals["batch_id"].iloc[0] or f"B{run_date.replace('-','')}-001"

    rows = []
    for _, row in df_proposals.iterrows():
        ref = f"ACAM-FX-{run_date.replace('-','')}-{int(row['priority']):03d}"
        rows.append({
            "Fund":           row["from_fund"],
            "Trade_Date":     run_date,
            "Value_Date":     row["value_date"] or "",
            "Sell_CCY":       row["sell_ccy"],
            "Sell_Amount":    row["sell_amount"],
            "Buy_CCY":        row["buy_ccy"],
            "Buy_Amount_USD": row["buy_amount"],
            "Ind_Rate":       row["fx_rate"],
            "Counterparty":   row["fx_counterparty"] or "JP MORGAN FX",
            "Reference":      ref,
            "Narrative":      f"Spot FX: sell {row['sell_ccy']} buy USD — {row['from_fund']}",
        })

    df_out = pd.DataFrame(rows, columns=SPOT_FX_COLUMNS)
    buf = _df_to_xlsx(df_out, sheet_name="SpotFX_Loader", run_date=run_date)
    file_hash = _sha256(buf)

    log_audit(conn, "LOADER_GENERATE", "spot_fx", batch_id,
              f"SpotFX loader: {len(rows)} rows | Batch: {batch_id}")

    return buf, len(rows), file_hash


# ─────────────────────────────────────────────────────────────────────────────
# SHARED HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _df_to_xlsx(df: pd.DataFrame, sheet_name: str, run_date: str) -> io.BytesIO:
    """Write DataFrame to a styled Excel BytesIO buffer (Apollo design)."""
    buf = io.BytesIO()
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name

    hdr_font = Font(bold=True, color=WHITE, size=9)
    hdr_fill = PatternFill("solid", fgColor=NAVY2)
    hdr_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin = Side(style="thin", color="CBD5E1")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    # Header row
    ws.append(list(df.columns))
    for cell in ws[1]:
        cell.font = hdr_font
        cell.fill = hdr_fill
        cell.alignment = hdr_align
        cell.border = border

    # Column indices (1-based) whose header contains "Amount" — formatted as currency
    amount_cols = {idx for idx, name in enumerate(df.columns, start=1) if "Amount" in str(name)}

    # Data rows — alternating fill
    for i, row_data in enumerate(dataframe_to_rows(df, index=False, header=False), start=2):
        ws.append(row_data)
        fill_color = OFFWHT if i % 2 == 0 else WHITE
        row_fill = PatternFill("solid", fgColor=fill_color)
        for cell in ws[i]:
            cell.fill = row_fill
            cell.border = border
            cell.alignment = Alignment(vertical="center")
            if cell.column in amount_cols and isinstance(cell.value, (int, float)):
                cell.number_format = '#,##0.00'

    # Auto-width columns
    for col in ws.columns:
        max_len = max((len(str(c.value or "")) for c in col), default=10)
        ws.column_dimensions[col[0].column_letter].width = min(max_len + 4, 40)

    # Freeze header row
    ws.freeze_panes = "A2"

    wb.save(buf)
    buf.seek(0)
    return buf


def _empty_xlsx(columns: list[str], sheet_name: str) -> io.BytesIO:
    """Return an empty XLSX with headers only."""
    return _df_to_xlsx(pd.DataFrame(columns=columns), sheet_name, "")


def _empty_csv(columns: list[str]) -> io.BytesIO:
    """Return an empty CSV with headers only."""
    buf = io.BytesIO()
    buf.write((",".join(columns) + "\n").encode("utf-8"))
    buf.seek(0)
    return buf


def _sha256(buf: io.BytesIO) -> str:
    buf.seek(0)
    digest = hashlib.sha256(buf.read()).hexdigest()[:16]
    buf.seek(0)
    return digest
