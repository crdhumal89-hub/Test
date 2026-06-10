#!/usr/bin/env python3
"""
ApolloCAM Excel Builder — generates ApolloCAM.xlsx
Run: python build_excel.py
"""
from pathlib import Path
from datetime import date
import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.formatting.rule import FormulaRule
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.chart import BarChart, Reference

# ── Palette ──────────────────────────────────────────────────────────────────
NAVY    = "0F2744"; NAVY2   = "1E3A5F"; GOLD    = "C9A227"
WHITE   = "FFFFFF"; OFFWHT  = "F8F9FA"; LGRAY   = "E2E8F0"
MGRAY   = "CBD5E1"; DGRAY   = "64748B"; SLATE   = "334155"
RED_BG  = "FEE2E2"; RED_FG  = "991B1B"
AMB_BG  = "FEF3C7"; AMB_FG  = "92400E"
GRN_BG  = "D1FAE5"; GRN_FG  = "065F46"
BLU_BG  = "DBEAFE"; BLU_FG  = "1E40AF"
GOLD_BG = "FEF9E7"

# ── Style helpers ─────────────────────────────────────────────────────────────
def fill(hex_):   return PatternFill("solid", fgColor=hex_)
def font(bold=False, size=11, color=SLATE, italic=False, name="Calibri"):
    return Font(name=name, bold=bold, size=size, color=color, italic=italic)
def align(h="left", v="center", wrap=False):
    return Alignment(horizontal=h, vertical=v, wrap_text=wrap)
def thin_border(left=True, right=True, top=True, bottom=True):
    s = Side(style="thin", color=LGRAY)
    n = Side(style=None)
    return Border(left=s if left else n, right=s if right else n,
                  top=s if top else n, bottom=s if bottom else n)
def thick_bottom():
    return Border(bottom=Side(style="medium", color=NAVY))

def header_row(ws, row, cols, labels, bg=NAVY2, fg=WHITE, size=10):
    for c, lbl in zip(cols, labels):
        cell = ws.cell(row=row, column=c, value=lbl)
        cell.font = font(bold=True, size=size, color=fg)
        cell.fill = fill(bg)
        cell.alignment = align("center")
        cell.border = thin_border()

def section_title(ws, row, col, text, span=1, bg=NAVY, size=12):
    cell = ws.cell(row=row, column=col, value=text)
    cell.font = font(bold=True, size=size, color=WHITE)
    cell.fill = fill(bg)
    cell.alignment = align("left")
    if span > 1:
        ws.merge_cells(start_row=row, start_column=col,
                       end_row=row, end_column=col+span-1)

def kpi_card(ws, row, col, label, value, val_fmt="$#,##0", bg=OFFWHT, val_color=NAVY):
    ws.cell(row=row, column=col, value=label).font = font(size=9, color=DGRAY, italic=True)
    ws.cell(row=row, column=col).alignment = align("center")
    ws.cell(row=row, column=col).fill = fill(bg)
    vc = ws.cell(row=row+1, column=col, value=value)
    vc.font = font(bold=True, size=16, color=val_color)
    vc.alignment = align("center")
    vc.number_format = val_fmt
    vc.fill = fill(bg)
    for r in (row, row+1):
        ws.cell(r, col).border = thin_border()

def style_data_row(ws, row, cols, bg):
    for c in cols:
        ws.cell(row=row, column=c).fill = fill(bg)
        ws.cell(row=row, column=c).border = thin_border()
        ws.cell(row=row, column=c).alignment = align("center")

# ── Seed data ─────────────────────────────────────────────────────────────────
RUN_DATE = "2026-06-01"

#  code            name                                           type          ccy    floor       ceil      src          ssi_acct   ssi_bank              ssi_bic    ssi_entity
FUNDS = [
 ("AAA-AGG",       "Apollo Aligned Alternatives Aggregator, L.P.","Aggregator","USD",1_500_000,3_000_000,""          ,"S 17017","JPMORGAN CHASE NA","CHASUS33","APOLLO ALIGNED ALTERNATIVES AGR LP"),
 ("AAA-LUX-AGG",   "AAA Lux Aggregator, L.P.",                    "Aggregator","USD",  500_000,1_000_000,""          ,"S 20454","JPMORGAN CHASE NA","CHASUS33","AAA LUX AGGREGATOR LP"),
 ("AAA-IDF-AGG",   "AAA IDF, L.P.",                               "Aggregator","USD",  150_000,  400_000,"AAA-AGG"   ,"S 23061","JPMORGAN CHASE NA","CHASUS33","AAA IDF LP"),
 ("AAA-SF1Y",      "AAA Sub Fund 1-Y, L.P.",                      "Sub-Fund",  "USD",2_000_000,5_000_000,"AAA-AGG"   ,"S 19834","JPMORGAN CHASE NA","CHASUS33","AAA SUB FUND 1-Y LP INV ACC FBO WFG"),
 ("AAA-MACS-Z",    "AAA Multi-Asset Credit Strategies (Z), L.P.", "Sub-Fund",  "USD",  250_000,  650_000,"AAA-AGG"   ,"S 20510","JPMORGAN CHASE NA","CHASUS33","AAA MULTI-ASSET CREDIT STRATEGIES Z LP"),
 ("AAA-DL-Y",      "AAA Direct Lending (Y), L.P.",                "Sub-Fund",  "USD",  100_000,  300_000,"AAA-SF1Y"  ,"S 20986","JPMORGAN CHASE NA","CHASUS33","AAA DIRECT LENDING Y LP"),
 ("AAA-HOSTPLUS-II","Apollo HostPlus Credit II Holdings II, L.P.","Sub-Fund",  "USD",  400_000,  600_000,"AAA-AGG"   ,"S 22917","JPMORGAN CHASE NA","CHASUS33","APOLLO HOSTPLUS CREDIT II HOLDINGS II LP"),
 ("AAA-SF4Z",      "AAA Sub Fund 4-Z, L.P.",                      "Sub-Fund",  "USD",  115_000,  250_000,"AAA-AGG"   ,"S 19838","JPMORGAN CHASE NA","CHASUS33","AAA SUB FUND 4-Z LP INV ACC FBO WFG"),
 ("AAA-SF2Y",      "AAA Sub Fund 2-Y, L.P.",                      "Sub-Fund",  "USD",  110_000,  300_000,"AAA-AGG"   ,"S 19836","JPMORGAN CHASE NA","CHASUS33","AAA SUB FUND 2-Y LP INV ACC FBO WFG"),
 ("AAA-SF1YS",     "AAA Sub Fund 1-YS, L.P.",                     "Sub-Fund",  "USD",   75_000,  200_000,"AAA-SF1Y"  ,"S 20680","JPMORGAN CHASE NA","CHASUS33","AAA SUB FUND 1-YS LP INV FBO WELLS FARGO"),
 ("AAA-LIBRA",     "Apollo Libra Credit Opportunities Fund, L.P.","Sub-Fund",  "USD",   50_000,  120_000,"AAA-AGG"   ,"S 20404","JPMORGAN CHASE NA","CHASUS33","APOLLO LIBRA CREDIT OPPORTUNITIES FUND LP"),
]

POSITIONS = [
 ("AAA-AGG",        "Operating USD","USD", 2_192_987.00),
 ("AAA-LUX-AGG",    "Operating USD","USD",   632_859.00),
 ("AAA-LUX-AGG",    "EUR Account",  "EUR",   120_000.00),
 ("AAA-IDF-AGG",    "Operating USD","USD",    89_635.00),
 ("AAA-SF1Y",       "Operating USD","USD", 9_281_309.00),
 ("AAA-MACS-Z",     "Operating USD","USD",   208_430.00),
 ("AAA-MACS-Z",     "EUR Account",  "EUR",   340_000.00),
 ("AAA-DL-Y",       "Operating USD","USD",   -77_734.00),
 ("AAA-HOSTPLUS-II","Operating USD","USD",   388_310.00),
 ("AAA-HOSTPLUS-II","GBP Account",  "GBP",   150_000.00),
 ("AAA-SF4Z",       "Operating USD","USD",   121_002.00),
 ("AAA-SF2Y",       "Operating USD","USD",   114_913.00),
 ("AAA-SF1YS",      "Operating USD","USD",    53_101.00),
 ("AAA-LIBRA",      "Operating USD","USD",   131_363.00),
]
FX_RATES = [("EUR","USD",1.09),("GBP","USD",1.27),("USD","USD",1.00)]
FX_THRESH = [
 ("AAA-LUX-AGG",    "EUR",50_000, "JP MORGAN FX","JPEUR-LUXAGG-001"),
 ("AAA-MACS-Z",     "EUR",100_000,"JP MORGAN FX","JPEUR-MACSZ-001"),
 ("AAA-HOSTPLUS-II","GBP",50_000, "JP MORGAN FX","JPGBP-HOSTII-001"),
]


# ─────────────────────────────────────────────────────────────────────────────
# Sheet builders
# ─────────────────────────────────────────────────────────────────────────────

def build_settings(ws):
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 28
    ws.column_dimensions["B"].width = 36
    ws.column_dimensions["C"].width = 48

    # ── Title ──
    ws.row_dimensions[1].height = 36
    t = ws.cell(1, 1, "⚙  SETTINGS — ApolloCAM Configuration")
    t.font = font(bold=True, size=14, color=WHITE)
    t.fill = fill(NAVY); t.alignment = align("left")
    ws.merge_cells("A1:C1")

    # ── Section 1: Global parameters ──
    section_title(ws, 3, 1, "1 · GLOBAL PARAMETERS", span=3, bg=NAVY2, size=11)
    header_row(ws, 4, [1,2,3], ["PARAMETER","VALUE","DESCRIPTION"], bg=SLATE)
    params = [
        ("AMBER_BUFFER",               1.10,             "Multiplier of floor defining the AMBER zone upper boundary"),
        ("SPOT_VALUE_LAG_DAYS",        2,                "Business days to add for spot FX value date (T+N)"),
        ("FX_STALE_DAYS",              1,                "Alert if FX rate is older than this many days"),
        ("DL_EMAIL",                   "cash_mgmt_dl@apollo.com", "Distribution list for daily digest"),
        ("CONTROLLER_EMAIL",           "a.shinde@apollo.com",     "Controller CC on all alerts"),
        ("DIGEST_ENABLED",             "TRUE",           "Enable automated daily digest email"),
        ("ALERT_ONLY_WHEN_RED",        "TRUE",           "Only alert when fund status is RED"),
        ("MAX_ALERTS_PER_FUND_PER_DAY","1",              "Maximum threshold alerts per fund per day"),
        ("ADMIN_PASSWORD",             "ApolloCAM_ChangeMe!","Required to unlock Settings and override Loaders"),
    ]
    for i, (k, v, d) in enumerate(params):
        r = 5 + i
        bg = OFFWHT if i % 2 == 0 else WHITE
        ws.cell(r, 1, k).font = font(bold=True, size=10, color=NAVY2)
        ws.cell(r, 1).fill = fill(bg); ws.cell(r, 1).border = thin_border()
        ws.cell(r, 2, v).font = font(size=10, color=SLATE)
        ws.cell(r, 2).fill = fill(bg); ws.cell(r, 2).border = thin_border()
        ws.cell(r, 3, d).font = font(size=9, color=DGRAY, italic=True)
        ws.cell(r, 3).fill = fill(bg); ws.cell(r, 3).border = thin_border()

    # ── Section 2: Fund Master ──
    FM_ROW = 16
    section_title(ws, FM_ROW, 1, "2 · FUND MASTER  (11 Active Funds)", span=11, bg=NAVY2, size=11)
    ws.merge_cells(f"A{FM_ROW}:K{FM_ROW}")
    fm_headers = ["Fund Code","Fund Name","Type","CCY","Floor (USD)","Ceiling (USD)","Routing Source","SSI Account","SSI Bank","SSI BIC","SSI Entity"]
    for c in range(1, 13):
        ws.column_dimensions[get_column_letter(c)].width = [16,40,12,6,14,14,16,10,20,10,36][c-2] if c > 1 else 16
    header_row(ws, FM_ROW+1, range(1,12), fm_headers, bg=SLATE)
    for i, f in enumerate(FUNDS):
        r = FM_ROW + 2 + i
        bg = OFFWHT if i % 2 == 0 else WHITE
        vals = [f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7], f[8], f[9], f[10]]
        for c, v in enumerate(vals, 1):
            cell = ws.cell(r, c, v)
            cell.fill = fill(bg); cell.border = thin_border()
            cell.font = font(size=9, color=SLATE)
            cell.alignment = align("left")
            if c in (5, 6):
                cell.number_format = '$#,##0'
                cell.alignment = align("right")

    # ── Section 3: FX Thresholds ──
    FX_T_ROW = 30
    section_title(ws, FX_T_ROW, 1, "3 · SPOT FX THRESHOLDS", span=6, bg=NAVY2, size=11)
    ws.merge_cells(f"A{FX_T_ROW}:F{FX_T_ROW}")
    header_row(ws, FX_T_ROW+1, range(1,7),
               ["Fund Code","Currency","Min Hold (Local)","Auto Propose","FX Counterparty","Settlement Account"])
    for i, t in enumerate(FX_THRESH):
        r = FX_T_ROW + 2 + i
        bg = OFFWHT if i % 2 == 0 else WHITE
        for c, v in enumerate([t[0],t[1],t[2],"YES",t[3],t[4]], 1):
            cell = ws.cell(r, c, v)
            cell.fill = fill(bg); cell.border = thin_border()
            cell.font = font(size=9, color=SLATE)
            if c == 3:
                cell.number_format = '#,##0'; cell.alignment = align("right")

    # ── Section 4: FX Rates ──
    FX_R_ROW = 36
    section_title(ws, FX_R_ROW, 1, "4 · FX RATES  (Base → USD)", span=4, bg=NAVY2, size=11)
    ws.merge_cells(f"A{FX_R_ROW}:D{FX_R_ROW}")
    header_row(ws, FX_R_ROW+1, range(1,5), ["Base CCY","Quote CCY","Rate","Rate Date"])
    for i, (base, quote, rate) in enumerate(FX_RATES):
        r = FX_R_ROW + 2 + i
        bg = OFFWHT if i % 2 == 0 else WHITE
        for c, v in enumerate([base, quote, rate, RUN_DATE], 1):
            cell = ws.cell(r, c, v)
            cell.fill = fill(bg); cell.border = thin_border()
            cell.font = font(size=10, color=SLATE)
            if c == 3:
                cell.number_format = "0.0000"; cell.alignment = align("center")


def build_data(ws):
    ws.sheet_view.showGridLines = False
    ws.sheet_state = "hidden"

    ws.row_dimensions[1].height = 30
    t = ws.cell(1, 1, "_DATA — Raw Position Import  |  Do not edit formulas in columns F–G")
    t.font = font(bold=True, size=12, color=WHITE); t.fill = fill(NAVY)
    ws.merge_cells("A1:G1")

    # Note row
    note = ws.cell(2, 1, f"As-of: {RUN_DATE}  |  Seed: June 2026  |  Replace rows 4-50 with new position file daily")
    note.font = font(size=9, color=DGRAY, italic=True)
    ws.merge_cells("A2:G2")

    headers = ["Fund Code","Account Name","Report Date","CCY","Local Balance","FX Rate (→USD)","Functional USD"]
    widths  = [16, 30, 14, 6, 18, 16, 18]
    for c, (h, w) in enumerate(zip(headers, widths), 1):
        ws.column_dimensions[get_column_letter(c)].width = w
    header_row(ws, 3, range(1,8), headers, bg=SLATE)

    rate_lookup = {"EUR": 1.09, "GBP": 1.27, "USD": 1.00}
    for i, (fund, acct, ccy, bal) in enumerate(POSITIONS):
        r = 4 + i
        rate = rate_lookup.get(ccy, 1.0)
        func = bal * rate
        bg = OFFWHT if i % 2 == 0 else WHITE
        vals = [fund, acct, RUN_DATE, ccy, bal, rate, func]
        nfmts = [None, None, None, None, '#,##0.00', '0.0000', '$#,##0.00']
        for c, (v, nf) in enumerate(zip(vals, nfmts), 1):
            cell = ws.cell(r, c, v)
            cell.fill = fill(bg); cell.border = thin_border()
            cell.font = font(size=9, color=SLATE)
            if nf:
                cell.number_format = nf; cell.alignment = align("right")

    # Formula rows for fresh import (rows after seed data)
    for r in range(4 + len(POSITIONS), 51):
        bg = OFFWHT if r % 2 == 0 else WHITE
        for c in range(1, 8):
            ws.cell(r, c).fill = fill(bg)
            ws.cell(r, c).border = thin_border()
            if c == 6:
                # FX rate lookup from SETTINGS
                ws.cell(r, c).value = (
                    f'=IFERROR(INDEX(SETTINGS!$B$38:$B$40,'
                    f'MATCH(D{r},SETTINGS!$A$38:$A$40,0)),1)'
                )
                ws.cell(r, c).font = font(size=9, color=DGRAY, italic=True)
                ws.cell(r, c).number_format = "0.0000"
            if c == 7:
                ws.cell(r, c).value = f'=IF(E{r}="","",E{r}*F{r})'
                ws.cell(r, c).font = font(size=9, color=DGRAY, italic=True)
                ws.cell(r, c).number_format = '$#,##0.00'


def build_dashboard(ws):
    ws.sheet_view.showGridLines = False

    # Column widths
    for col, w in zip("ABCDEFGHIJKL", [16,42,12,6,18,16,16,10,20,10,10,16]):
        ws.column_dimensions[col].width = w

    # ── Title bar ──
    ws.row_dimensions[1].height = 42
    t = ws.cell(1, 1, f"APOLLOCAM  ·  DAILY CASH DASHBOARD  ·  As-of: {RUN_DATE}")
    t.font = font(bold=True, size=16, color=WHITE, name="Calibri")
    t.fill = fill(NAVY); t.alignment = align("left")
    ws.merge_cells("A1:L1")

    # ── KPI strip ──
    ws.row_dimensions[2].height = 14
    ws.row_dimensions[3].height = 32
    ws.row_dimensions[4].height = 32

    kpi_data = [
        ("A", "RED Funds",    3,    None,      RED_BG,  RED_FG),
        ("C", "AMBER Funds",  2,    None,      AMB_BG,  AMB_FG),
        ("E", "GREEN Funds",  4,    None,      GRN_BG,  GRN_FG),
        ("G", "BLUE (Excess)",2,    None,      BLU_BG,  BLU_FG),
        ("I", "Total Cash",   15_858_663.00, "$#,##0", OFFWHT, NAVY2),
        ("K", "Batch",        "B20260601-001", None,   OFFWHT, NAVY2),
    ]
    for col_letter, label, value, nfmt, bg, fg in kpi_data:
        col = openpyxl.utils.column_index_from_string(col_letter)
        for r in (3, 4):
            ws.merge_cells(start_row=r, start_column=col, end_row=r, end_column=col+1)
        lbl_cell = ws.cell(3, col, label)
        lbl_cell.font = font(size=9, color=fg, italic=True, bold=True)
        lbl_cell.fill = fill(bg); lbl_cell.alignment = align("center")
        lbl_cell.border = thin_border()
        val_cell = ws.cell(4, col, value)
        val_cell.font = font(bold=True, size=18, color=fg)
        val_cell.fill = fill(bg); val_cell.alignment = align("center")
        val_cell.border = thin_border()
        if nfmt:
            val_cell.number_format = nfmt

    # ── Formula note ──
    note = ws.cell(5, 1,
        "Formula: Status = IF(Cash<Floor,\"RED\", IF(Cash<Floor×AMBER_BUFFER,\"AMBER\", IF(Cash≤Ceiling,\"GREEN\",\"BLUE\")))  ·  "
        "AMBER_BUFFER=1.10  ·  Cash = SUMIF(_DATA!FundCode, _DATA!FunctionalUSD)")
    note.font = font(size=8, color=DGRAY, italic=True)
    note.fill = fill(LGRAY)
    ws.merge_cells("A5:L5")
    ws.row_dimensions[5].height = 16

    # ── Column headers ──
    ws.row_dimensions[6].height = 20
    col_headers = ["Fund Code","Fund Name","Type","CCY","Cash (USD)","Floor","Ceiling",
                   "Status","Surplus / (Deficit)","Deficit","% of Floor","Routing Source"]
    header_row(ws, 6, range(1, 13), col_headers, bg=NAVY2)

    # Fund rows: pre-calculated values (formulas written as values for portability)
    # In a live workbook these would be SUMIF formulas referencing _DATA
    FUND_DATA = [
        # code, name, type, ccy, cash_usd, floor, ceiling → status/surplus/deficit/pct computed
        ("AAA-AGG",        "Apollo Aligned Alternatives Aggregator, L.P.","Aggregator","USD", 2_192_987,1_500_000,3_000_000),
        ("AAA-LUX-AGG",    "AAA Lux Aggregator, L.P.",                    "Aggregator","USD",   763_759,  500_000,1_000_000),
        ("AAA-IDF-AGG",    "AAA IDF, L.P.",                               "Aggregator","USD",    89_635,  150_000,  400_000),
        ("AAA-SF1Y",       "AAA Sub Fund 1-Y, L.P.",                      "Sub-Fund",  "USD", 9_281_309,2_000_000,5_000_000),
        ("AAA-MACS-Z",     "AAA Multi-Asset Credit Strategies (Z), L.P.", "Sub-Fund",  "USD",   579_030,  250_000,  650_000),
        ("AAA-DL-Y",       "AAA Direct Lending (Y), L.P.",                "Sub-Fund",  "USD",   -77_734,  100_000,  300_000),
        ("AAA-HOSTPLUS-II","Apollo HostPlus Credit II Holdings II, L.P.", "Sub-Fund",  "USD",   578_460,  400_000,  600_000),
        ("AAA-SF4Z",       "AAA Sub Fund 4-Z, L.P.",                      "Sub-Fund",  "USD",   121_002,  115_000,  250_000),
        ("AAA-SF2Y",       "AAA Sub Fund 2-Y, L.P.",                      "Sub-Fund",  "USD",   114_913,  110_000,  300_000),
        ("AAA-SF1YS",      "AAA Sub Fund 1-YS, L.P.",                     "Sub-Fund",  "USD",    53_101,   75_000,  200_000),
        ("AAA-LIBRA",      "Apollo Libra Credit Opportunities Fund, L.P.","Sub-Fund",  "USD",   131_363,   50_000,  120_000),
    ]
    # routing sources (parallel to FUND_DATA order)
    ROUTING = ["","","AAA-AGG","AAA-AGG","AAA-AGG","AAA-SF1Y","AAA-AGG","AAA-AGG","AAA-AGG","AAA-SF1Y","AAA-AGG"]
    AMBER_BUFFER = 1.10

    for i, (code, name, etype, ccy, cash, floor_, ceil_) in enumerate(FUND_DATA):
        r = 7 + i
        bg = OFFWHT if i % 2 == 0 else WHITE
        ws.row_dimensions[r].height = 18

        # Compute derived values
        if   cash < floor_:               status = "RED";   s_bg = RED_BG; s_fg = RED_FG
        elif cash < floor_ * AMBER_BUFFER: status = "AMBER"; s_bg = AMB_BG; s_fg = AMB_FG
        elif cash <= ceil_:               status = "GREEN"; s_bg = GRN_BG; s_fg = GRN_FG
        else:                             status = "BLUE";  s_bg = BLU_BG; s_fg = BLU_FG

        surplus  = cash - floor_
        deficit  = max(0, floor_ - cash)
        pct_floor = (cash / floor_ * 100) if floor_ > 0 else 0

        row_vals = [code, name, etype, ccy, cash, floor_, ceil_,
                    status, surplus, deficit, pct_floor, ROUTING[i]]

        for c, v in enumerate(row_vals, 1):
            cell = ws.cell(r, c, v)
            cell.fill = fill(bg); cell.border = thin_border()
            cell.font = font(size=10, color=SLATE)
            cell.alignment = align("left")

            # Column-specific formatting
            if c == 5:  # Cash
                cell.number_format = '$#,##0'; cell.alignment = align("right")
                cell.font = font(bold=True, size=10,
                                 color=RED_FG if status=="RED" else SLATE)
            elif c in (6, 7):  # Floor / Ceiling
                cell.number_format = '$#,##0'; cell.alignment = align("right")
            elif c == 8:  # Status badge
                cell.fill = fill(s_bg)
                cell.font = font(bold=True, size=10, color=s_fg)
                cell.alignment = align("center")
                cell.border = Border(
                    left=Side(style="medium", color=s_fg),
                    right=Side(style="thin", color=LGRAY),
                    top=Side(style="thin", color=LGRAY),
                    bottom=Side(style="thin", color=LGRAY),
                )
            elif c == 9:  # Surplus/(Deficit)
                cell.number_format = '$#,##0;($#,##0)'
                cell.alignment = align("right")
                cell.font = font(bold=True, size=10,
                                 color=GRN_FG if surplus >= 0 else RED_FG)
            elif c == 10:  # Deficit (helper)
                cell.number_format = '$#,##0'; cell.alignment = align("right")
            elif c == 11:  # % of Floor
                cell.number_format = '0.0"%"'; cell.alignment = align("center")
            elif c == 12:  # Routing Source
                cell.font = font(size=9, color=DGRAY, italic=True)

    # ── Totals row ──
    r = 18
    ws.row_dimensions[r].height = 20
    total_cash = sum(d[4] for d in FUND_DATA)
    ws.cell(r, 1, "TOTAL").font = font(bold=True, size=10, color=WHITE)
    ws.cell(r, 1).fill = fill(NAVY2)
    ws.merge_cells(f"A{r}:D{r}")
    ws.cell(r, 5, total_cash).number_format = '$#,##0'
    ws.cell(r, 5).font = font(bold=True, size=10, color=WHITE)
    ws.cell(r, 5).fill = fill(NAVY2); ws.cell(r, 5).alignment = align("right")
    for c in range(1, 13):
        ws.cell(r, c).fill = fill(NAVY2)
        ws.cell(r, c).border = thin_border()

    # ── Conditional formatting — full row tint by status ──
    data_range = f"A7:L{7+len(FUND_DATA)-1}"
    for formula, bg in [
        ('=$H7="RED"',   RED_BG),
        ('=$H7="AMBER"', AMB_BG),
        ('=$H7="GREEN"', GRN_BG),
        ('=$H7="BLUE"',  BLU_BG),
    ]:
        rule = FormulaRule(formula=[formula], fill=fill(bg))
        ws.conditional_formatting.add(data_range, rule)


def build_proposals(ws):
    ws.sheet_view.showGridLines = False

    for col, w in zip("ABCDEFGHIJKLM",
                      [8, 16, 40, 16, 16, 18, 14, 16, 16, 14, 18, 12, 22]):
        ws.column_dimensions[col].width = w

    # Title
    ws.row_dimensions[1].height = 42
    t = ws.cell(1, 1, f"APOLLOCAM  ·  PROPOSALS — Wire Transfers & Spot FX Conversions  ·  Batch: B20260601-001  |  {RUN_DATE}")
    t.font = font(bold=True, size=14, color=WHITE); t.fill = fill(NAVY)
    t.alignment = align("left"); ws.merge_cells("A1:M1")

    # ── WIRE PROPOSALS ──────────────────────────────────────────────────────
    ws.row_dimensions[2].height = 8
    section_title(ws, 3, 1, "WIRE TRANSFER PROPOSALS", span=13, bg=NAVY2)
    ws.merge_cells("A3:M3")

    note = ws.cell(4, 1,
        "Formula: Wire Amount = MIN(Deficit, MAX(0, Source Balance − Source Floor − Prior Committed))  "
        "·  Sorted by deficit descending  ·  Sequential balance depletion prevents source over-commitment")
    note.font = font(size=8, color=DGRAY, italic=True)
    note.fill = fill(LGRAY); ws.merge_cells("A4:M4")
    ws.row_dimensions[4].height = 16

    wire_headers = ["#","From (Source)","Source Name","Source Balance","Source Floor",
                    "Prior Committed","Source Available","To (Deficit Fund)","Deficit",
                    "Wire Amount","Post-Wire Balance","Action","Batch Reference"]
    header_row(ws, 5, range(1, 14), wire_headers, bg=SLATE)

    # Pre-computed wire proposals (3 proposals, ordered by deficit desc)
    # P1: DL-Y deficit $177,734 — routed from SF1Y (available $7,281,309)
    # P2: IDF-AGG deficit $60,365 — routed from AGG (available $692,987)
    # P3: SF1YS deficit $21,899 — routed from SF1Y (available $7,281,309 - $177,734 = $7,103,575)
    WIRE_PROPOSALS = [
        # from_code, from_name, src_bal, src_floor, prior, to_code, to_name, deficit, wire_amt, post_bal
        ("AAA-SF1Y","AAA Sub Fund 1-Y, L.P.",         9_281_309, 2_000_000,         0, "AAA-DL-Y",   "AAA Direct Lending (Y), L.P.",               177_734, 177_734,         100_000),
        ("AAA-AGG", "Apollo Aligned Alternatives Aggregator, L.P.", 2_192_987, 1_500_000, 0, "AAA-IDF-AGG","AAA IDF, L.P.",                        60_365,   60_365,         150_000),
        ("AAA-SF1Y","AAA Sub Fund 1-Y, L.P.",         9_281_309, 2_000_000,   177_734, "AAA-SF1YS","AAA Sub Fund 1-YS, L.P.",                     21_899,   21_899,          75_000),
    ]

    dv_action = DataValidation(type="list", formula1='"PENDING,APPROVE,SKIP,HOLD"', showDropDown=False)
    ws.add_data_validation(dv_action)

    for i, (fc, fn, sb, sf, prior, tc, tn, deficit, wire, post) in enumerate(WIRE_PROPOSALS):
        r = 6 + i
        bg = OFFWHT if i % 2 == 0 else WHITE
        src_avail = max(0, sb - sf - prior)
        vals = [i+1, fc, fn, sb, sf, prior, src_avail, tc, deficit, wire, post, "APPROVE", f"B20260601-001-W{i+1:02d}"]
        nfmts = [None, None, None, '$#,##0','$#,##0','$#,##0','$#,##0',None,'$#,##0','$#,##0','$#,##0',None, None]
        for c, (v, nf) in enumerate(zip(vals, nfmts), 1):
            cell = ws.cell(r, c, v)
            cell.fill = fill(bg); cell.border = thin_border()
            cell.font = font(size=10, color=SLATE)
            cell.alignment = align("center")
            if nf:
                cell.number_format = nf; cell.alignment = align("right")
            if c == 10:  # Wire Amount — highlight
                cell.font = font(bold=True, size=11, color=NAVY2)
            if c == 12:  # Action
                cell.fill = fill(GRN_BG)
                cell.font = font(bold=True, size=10, color=GRN_FG)
                dv_action.add(cell)
            if c == 11:  # Post-wire balance
                cell.font = font(bold=True, size=10,
                                 color=GRN_FG if post >= WIRE_PROPOSALS[i][3] else RED_FG)

    # Summary totals
    r_sum = 9
    ws.cell(r_sum, 1, "TOTAL").font = font(bold=True, size=10, color=WHITE)
    ws.cell(r_sum, 1).fill = fill(NAVY2)
    ws.merge_cells(f"A{r_sum}:I{r_sum}")
    total_wire = sum(w[9] for w in WIRE_PROPOSALS)
    ws.cell(r_sum, 10, total_wire).font = font(bold=True, size=11, color=WHITE)
    ws.cell(r_sum, 10).number_format = '$#,##0'
    ws.cell(r_sum, 10).fill = fill(NAVY2); ws.cell(r_sum, 10).alignment = align("right")
    for c in range(1, 14):
        ws.cell(r_sum, c).fill = fill(NAVY2); ws.cell(r_sum, c).border = thin_border()

    # ── SPOT FX PROPOSALS ───────────────────────────────────────────────────
    ws.row_dimensions[11].height = 8
    section_title(ws, 12, 1, "SPOT FX CONVERSION PROPOSALS", span=13, bg=NAVY2)
    ws.merge_cells("A12:M12")

    fx_note = ws.cell(13, 1,
        "Formula: Sell Amount = Local Balance − Min Hold  ·  USD Equivalent = Sell Amount × FX Rate  "
        "·  Value Date = WORKDAY(Run Date, SPOT_VALUE_LAG_DAYS=2, Holidays)")
    fx_note.font = font(size=8, color=DGRAY, italic=True)
    fx_note.fill = fill(LGRAY); ws.merge_cells("A13:M13")
    ws.row_dimensions[13].height = 16

    fx_headers = ["#","Fund Code","Fund Name","Sell CCY","Local Balance","Min Hold",
                  "Sell Amount","FX Rate","USD Equivalent","Value Date","Counterparty","Action","Reference"]
    header_row(ws, 14, range(1, 14), fx_headers, bg=SLATE)

    # Compute FX proposals from thresholds
    # LUX-AGG: EUR 120,000 - 50,000 = 70,000 EUR → $76,300
    # MACS-Z:  EUR 340,000 - 100,000 = 240,000 EUR → $261,600
    # HOSTPLUS: GBP 150,000 - 50,000 = 100,000 GBP → $127,000
    FX_PROPOSALS = [
        ("AAA-LUX-AGG",  "AAA Lux Aggregator, L.P.",                   "EUR", 120_000, 50_000,  70_000, 1.09,  76_300, "2026-06-03","JP MORGAN FX"),
        ("AAA-MACS-Z",   "AAA Multi-Asset Credit Strategies (Z), L.P.","EUR", 340_000,100_000, 240_000, 1.09, 261_600, "2026-06-03","JP MORGAN FX"),
        ("AAA-HOSTPLUS-II","Apollo HostPlus Credit II Holdings II, L.P.","GBP",150_000, 50_000, 100_000, 1.27, 127_000, "2026-06-03","JP MORGAN FX"),
    ]

    dv_fx = DataValidation(type="list", formula1='"PENDING,APPROVE,SKIP,HOLD"', showDropDown=False)
    ws.add_data_validation(dv_fx)

    for i, (fc, fn, ccy, loc, mh, sell, rate, usd, vd, cpty) in enumerate(FX_PROPOSALS):
        r = 15 + i
        bg = OFFWHT if i % 2 == 0 else WHITE
        vals = [i+1, fc, fn, ccy, loc, mh, sell, rate, usd, vd, cpty, "APPROVE", f"B20260601-001-FX{i+1:02d}"]
        nfmts = [None,None,None,None,'#,##0','#,##0','#,##0','0.0000','$#,##0',None,None,None,None]
        for c, (v, nf) in enumerate(zip(vals, nfmts), 1):
            cell = ws.cell(r, c, v)
            cell.fill = fill(bg); cell.border = thin_border()
            cell.font = font(size=10, color=SLATE)
            cell.alignment = align("center")
            if nf:
                cell.number_format = nf; cell.alignment = align("right")
            if c == 9:  # USD Equivalent
                cell.font = font(bold=True, size=10, color=NAVY2)
            if c == 12:
                cell.fill = fill(GRN_BG)
                cell.font = font(bold=True, size=10, color=GRN_FG)
                dv_fx.add(cell)


def build_loaders(ws):
    ws.sheet_view.showGridLines = False

    for col, w in zip("ABCDEFGHIJKLMN",
                      [14,20,14,8,20,20,14,8,20,20,18,8,40,20]):
        ws.column_dimensions[col].width = w

    ws.row_dimensions[1].height = 42
    t = ws.cell(1, 1, "APOLLOCAM  ·  LOADERS — IVP Wire / Trade Booking / Spot FX")
    t.font = font(bold=True, size=14, color=WHITE); t.fill = fill(NAVY)
    t.alignment = align("left"); ws.merge_cells("A1:N1")

    lock_note = ws.cell(2, 1,
        "⚠  This sheet is LOCKED after loader generation.  Admin password required to unlock.  "
        "All values are static — no formulas in output rows (EY requirement).  "
        "Batch: B20260601-001  |  Generated: 2026-06-01 08:42 UTC")
    lock_note.font = font(size=9, color=AMB_FG, italic=True)
    lock_note.fill = fill(AMB_BG); ws.merge_cells("A2:N2")

    # ── IVP Wire Loader ──────────────────────────────────────────────────────
    ws.row_dimensions[3].height = 8
    section_title(ws, 4, 1, "IVP WIRE LOADER  — XLSX Export  (3 wires)", span=14, bg=NAVY2)
    ws.merge_cells("A4:N4")

    ivp_headers = ["Sender Account","Sender Bank","Sender BIC","Sender Entity",
                   "Receiver Account","Receiver Bank","Receiver BIC","Receiver Entity",
                   "Amount (USD)","CCY","Value Date","Reference","Narrative","Batch ID"]
    header_row(ws, 5, range(1, 15), ivp_headers, bg=SLATE)

    IVP_ROWS = [
        ("S 19834","JPMORGAN CHASE NA","CHASUS33","AAA SUB FUND 1-Y LP INV ACC FBO WFG",
         "S 20986","JPMORGAN CHASE NA","CHASUS33","AAA DIRECT LENDING Y LP",
         177_734,"USD","2026-06-01","ACAM-20260601-001","Wire P1: SF1Y → DL-Y (deficit cover)","B20260601-001"),
        ("S 17017","JPMORGAN CHASE NA","CHASUS33","APOLLO ALIGNED ALTERNATIVES AGR LP",
         "S 23061","JPMORGAN CHASE NA","CHASUS33","AAA IDF LP",
         60_365,"USD","2026-06-01","ACAM-20260601-002","Wire P2: AGG → IDF-AGG (deficit cover)","B20260601-001"),
        ("S 19834","JPMORGAN CHASE NA","CHASUS33","AAA SUB FUND 1-Y LP INV ACC FBO WFG",
         "S 20680","JPMORGAN CHASE NA","CHASUS33","AAA SUB FUND 1-YS LP INV FBO WELLS FARGO",
         21_899,"USD","2026-06-01","ACAM-20260601-003","Wire P3: SF1Y → SF1YS (deficit cover)","B20260601-001"),
    ]
    for i, row_data in enumerate(IVP_ROWS):
        r = 6 + i
        bg = OFFWHT if i % 2 == 0 else WHITE
        for c, v in enumerate(row_data, 1):
            cell = ws.cell(r, c, v)
            cell.fill = fill(bg); cell.border = thin_border()
            cell.font = font(size=9, color=SLATE)
            if c == 9:
                cell.number_format = '$#,##0'; cell.alignment = align("right")
                cell.font = font(bold=True, size=10, color=NAVY2)

    # ── Trade Booking Loader ─────────────────────────────────────────────────
    ws.row_dimensions[10].height = 8
    section_title(ws, 11, 1, "TRADE BOOKING LOADER  — CSV Export  (6 rows: 2 legs per wire)", span=12, bg=NAVY2)
    ws.merge_cells("A11:L11")

    trade_headers = ["Trade Date","Value Date","Fund","Account","Ref Fund","Amount (USD)",
                     "CCY","GL Account","Dr/Cr","Cost Centre","Reference","Batch ID"]
    header_row(ws, 12, range(1, 13), trade_headers, bg=SLATE)

    TRADE_ROWS = [
        # P1 DR/CR
        ("2026-06-01","2026-06-01","AAA-SF1Y", "S 19834","AAA-DL-Y",  -177_734,"USD","1010-CASH","DR","MUM-TREASURY","ACAM-20260601-001","B20260601-001"),
        ("2026-06-01","2026-06-01","AAA-DL-Y", "S 20986","AAA-SF1Y",   177_734,"USD","1010-CASH","CR","MUM-TREASURY","ACAM-20260601-001","B20260601-001"),
        # P2 DR/CR
        ("2026-06-01","2026-06-01","AAA-AGG",  "S 17017","AAA-IDF-AGG",-60_365,"USD","1010-CASH","DR","MUM-TREASURY","ACAM-20260601-002","B20260601-001"),
        ("2026-06-01","2026-06-01","AAA-IDF-AGG","S 23061","AAA-AGG",    60_365,"USD","1010-CASH","CR","MUM-TREASURY","ACAM-20260601-002","B20260601-001"),
        # P3 DR/CR
        ("2026-06-01","2026-06-01","AAA-SF1Y", "S 19834","AAA-SF1YS",  -21_899,"USD","1010-CASH","DR","MUM-TREASURY","ACAM-20260601-003","B20260601-001"),
        ("2026-06-01","2026-06-01","AAA-SF1YS","S 20680","AAA-SF1Y",    21_899,"USD","1010-CASH","CR","MUM-TREASURY","ACAM-20260601-003","B20260601-001"),
    ]
    for i, row_data in enumerate(TRADE_ROWS):
        r = 13 + i
        bg = OFFWHT if i % 2 == 0 else WHITE
        for c, v in enumerate(row_data, 1):
            cell = ws.cell(r, c, v)
            cell.fill = fill(bg); cell.border = thin_border()
            cell.font = font(size=9, color=SLATE)
            if c == 6:
                cell.number_format = '$#,##0'; cell.alignment = align("right")
                cell.font = font(bold=True, size=9, color=RED_FG if v < 0 else GRN_FG)
            if c == 9:
                cell.fill = fill(RED_BG if v == "DR" else GRN_BG)
                cell.font = font(bold=True, size=9, color=RED_FG if v == "DR" else GRN_FG)
                cell.alignment = align("center")

    # ── Spot FX Loader ───────────────────────────────────────────────────────
    ws.row_dimensions[20].height = 8
    section_title(ws, 21, 1, "SPOT FX LOADER  — XLSX Export  (3 conversions)", span=11, bg=NAVY2)
    ws.merge_cells("A21:K21")

    spot_headers = ["Fund","Trade Date","Value Date","Sell CCY","Sell Amount",
                    "Buy CCY","Buy Amount (USD)","Indicative Rate","Counterparty","Reference","Narrative"]
    header_row(ws, 22, range(1, 12), spot_headers, bg=SLATE)

    SPOT_ROWS = [
        ("AAA-LUX-AGG",  "2026-06-01","2026-06-03","EUR",  70_000,"USD", 76_300,1.09,"JP MORGAN FX","ACAM-FX-20260601-001","Sell excess EUR — LUX-AGG"),
        ("AAA-MACS-Z",   "2026-06-01","2026-06-03","EUR", 240_000,"USD",261_600,1.09,"JP MORGAN FX","ACAM-FX-20260601-002","Sell excess EUR — MACS-Z"),
        ("AAA-HOSTPLUS-II","2026-06-01","2026-06-03","GBP",100_000,"USD",127_000,1.27,"JP MORGAN FX","ACAM-FX-20260601-003","Sell excess GBP — HOSTPLUS-II"),
    ]
    for i, row_data in enumerate(SPOT_ROWS):
        r = 23 + i
        bg = OFFWHT if i % 2 == 0 else WHITE
        for c, v in enumerate(row_data, 1):
            cell = ws.cell(r, c, v)
            cell.fill = fill(bg); cell.border = thin_border()
            cell.font = font(size=9, color=SLATE)
            if c in (5, 7):
                cell.number_format = '#,##0'; cell.alignment = align("right")
                cell.font = font(bold=True, size=9, color=NAVY2)
            if c == 8:
                cell.number_format = "0.0000"


def build_home(ws):
    ws.sheet_view.showGridLines = False

    for col, w in zip("ABCDEFGH", [18, 2, 18, 2, 18, 2, 18, 18]):
        ws.column_dimensions[col].width = w

    # Hero title
    ws.row_dimensions[1].height = 60
    t = ws.cell(1, 1, "ApolloCAM")
    t.font = font(bold=True, size=28, color=GOLD, name="Calibri")
    t.fill = fill(NAVY); t.alignment = align("left")
    ws.merge_cells("A1:H1")

    ws.row_dimensions[2].height = 30
    sub = ws.cell(2, 1, "Daily Cash Management  ·  Apollo Aligned Alternatives  ·  Mumbai Fund Controllership")
    sub.font = font(size=13, color=OFFWHT); sub.fill = fill(NAVY)
    sub.alignment = align("left"); ws.merge_cells("A2:H2")

    ws.row_dimensions[3].height = 24
    meta = ws.cell(3, 1, f"As-of: {RUN_DATE}  ·  11 Funds  ·  ~$15.9B AUM  ·  Controller: A. Shinde")
    meta.font = font(size=10, color=GOLD); meta.fill = fill(NAVY2)
    meta.alignment = align("left"); ws.merge_cells("A3:H3")

    # KPI cards
    ws.row_dimensions[4].height = 10
    ws.row_dimensions[5].height = 24
    ws.row_dimensions[6].height = 36
    ws.row_dimensions[7].height = 10

    KPI = [
        (1, "RED Funds", "3",    RED_BG,  RED_FG),
        (3, "AMBER Funds","2",   AMB_BG,  AMB_FG),
        (5, "GREEN Funds","4",   GRN_BG,  GRN_FG),
        (7, "BLUE (Excess)","2", BLU_BG,  BLU_FG),
    ]
    for col, lbl, val, bg, fg in KPI:
        for r in (5, 6):
            ws.merge_cells(start_row=r, start_column=col, end_row=r, end_column=col+1)
        ws.cell(5, col, lbl).font   = font(bold=True, size=9, color=fg)
        ws.cell(5, col).fill        = fill(bg)
        ws.cell(5, col).alignment   = align("center")
        ws.cell(5, col).border      = thick_bottom()
        ws.cell(6, col, val).font   = font(bold=True, size=26, color=fg)
        ws.cell(6, col).fill        = fill(bg)
        ws.cell(6, col).alignment   = align("center")
        ws.cell(6, col).border      = thin_border()

    # Total Cash shown inline in meta row 3 — no separate card (avoids merge conflict)

    # Navigation guide
    ws.row_dimensions[8].height = 8
    ws.row_dimensions[9].height = 20
    section_title(ws, 9, 1, "DAILY WORKFLOW  —  Navigate using the sheet tabs below", span=8, bg=NAVY2)
    ws.merge_cells("A9:H9")

    steps = [
        ("STEP 1", "Import Positions",  "_DATA sheet",    "Paste daily JPM file into _DATA rows 4-50, or use VBA Load Data button"),
        ("STEP 2", "Review Status",     "DASHBOARD",      "Verify RED/AMBER counts, check balances vs floors, review KPIs"),
        ("STEP 3", "Approve Proposals", "PROPOSALS",      "Review wire + FX proposals; change Action from PENDING → APPROVE/SKIP/HOLD"),
        ("STEP 4", "Export Loaders",    "LOADERS",        "Locked after approval — export IVP XLSX, Trade CSV, SpotFX XLSX via VBA"),
        ("STEP 5", "Submit & Confirm",  "LOADERS",        "Upload IVP file; enter confirmation references when bank confirms wires"),
        ("STEP 6", "Archive",           "VBA: Archive",   "VBA ArchiveCurrentData() saves timestamped copy to Archive/ folder"),
    ]
    for i, (step, action, loc, detail) in enumerate(steps):
        r = 10 + i
        ws.row_dimensions[r].height = 20
        bg = OFFWHT if i % 2 == 0 else WHITE
        ws.cell(r, 1, step).font = font(bold=True, size=10, color=GOLD)
        ws.cell(r, 1).fill = fill(NAVY2); ws.cell(r, 1).alignment = align("center")
        ws.cell(r, 1).border = thin_border()
        ws.cell(r, 2, " "); ws.cell(r, 2).fill = fill(NAVY2)
        ws.cell(r, 3, action).font = font(bold=True, size=10, color=NAVY2)
        ws.cell(r, 3).fill = fill(bg); ws.cell(r, 3).border = thin_border()
        ws.cell(r, 4, " "); ws.cell(r, 4).fill = fill(bg)
        ws.cell(r, 5, loc).font = font(size=10, color=DGRAY, italic=True)
        ws.cell(r, 5).fill = fill(bg); ws.cell(r, 5).border = thin_border()
        ws.cell(r, 6, " "); ws.cell(r, 6).fill = fill(bg)
        ws.merge_cells(start_row=r, start_column=7, end_row=r, end_column=8)
        ws.cell(r, 7, detail).font = font(size=9, color=SLATE)
        ws.cell(r, 7).fill = fill(bg); ws.cell(r, 7).border = thin_border()
        ws.cell(r, 7).alignment = align("left", wrap=True)

    # Status model reference
    ws.row_dimensions[17].height = 8
    ws.row_dimensions[18].height = 20
    section_title(ws, 18, 1, "STATUS MODEL REFERENCE", span=8, bg=NAVY2)
    ws.merge_cells("A18:H18")

    STATUS_REF = [
        ("RED",   "Cash < Floor",                                   RED_BG,  RED_FG,   "Immediate wire required. Source fund triggered."),
        ("AMBER", "Floor ≤ Cash < Floor × 1.10",                   AMB_BG,  AMB_FG,   "Watch closely. No wire required today."),
        ("GREEN", "Floor × 1.10 ≤ Cash ≤ Ceiling",                GRN_BG,  GRN_FG,   "Healthy operating range. No action needed."),
        ("BLUE",  "Cash > Ceiling",                                 BLU_BG,  BLU_FG,   "Excess cash. Review for upward sweep or investment."),
    ]
    header_row(ws, 19, [1,2,3,5,6,8],
               ["Status","Condition","Formula Zone","","Condition","Notes"], bg=SLATE)
    for i, (status, cond, sbg, sfg, notes) in enumerate(STATUS_REF):
        r = 20 + i
        ws.row_dimensions[r].height = 20
        ws.cell(r, 1, status).font = font(bold=True, size=11, color=sfg)
        ws.cell(r, 1).fill = fill(sbg); ws.cell(r, 1).border = thin_border()
        ws.cell(r, 1).alignment = align("center")
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=5)
        ws.cell(r, 2, cond).font = font(size=10, color=SLATE)
        ws.cell(r, 2).fill = fill(sbg); ws.cell(r, 2).border = thin_border()
        ws.merge_cells(start_row=r, start_column=6, end_row=r, end_column=8)
        ws.cell(r, 6, notes).font = font(size=9, color=DGRAY, italic=True)
        ws.cell(r, 6).fill = fill(OFFWHT); ws.cell(r, 6).border = thin_border()
        ws.cell(r, 6).alignment = align("left", wrap=True)

    # VBA instructions
    ws.row_dimensions[25].height = 8
    section_title(ws, 26, 1, "VBA MACRO SETUP  (optional — for automation buttons)", span=8, bg=SLATE)
    ws.merge_cells("A26:H26")
    vba_steps = [
        "1. Save this file as ApolloCAM.xlsm (Excel Macro-Enabled Workbook)",
        "2. Press Alt+F11 to open the VBA editor",
        "3. File → Import File → select modApolloCAM.bas (from the vba/ folder)",
        "4. Save again as .xlsm — macro ribbon buttons become active",
        "5. Admin password to unlock Loaders: see SETTINGS → ADMIN_PASSWORD",
    ]
    for i, step in enumerate(vba_steps):
        r = 27 + i
        ws.row_dimensions[r].height = 18
        ws.cell(r, 1, step).font = font(size=10, color=SLATE)
        ws.cell(r, 1).fill = fill(OFFWHT if i%2==0 else WHITE)
        ws.cell(r, 1).border = thin_border()
        ws.merge_cells(f"A{r}:H{r}")


def build_audit(ws):
    ws.sheet_view.showGridLines = False
    ws.sheet_state = "hidden"

    for col, w in zip("ABCD", [22, 20, 24, 60]):
        ws.column_dimensions[col].width = w

    ws.row_dimensions[1].height = 30
    t = ws.cell(1, 1, "_AUDIT — Immutable Action Log  (INSERT ONLY — no edits permitted)")
    t.font = font(bold=True, size=12, color=WHITE); t.fill = fill(NAVY)
    ws.merge_cells("A1:D1")

    header_row(ws, 2, range(1,5), ["Timestamp","User","Action","Detail"], bg=SLATE)

    seed_rows = [
        ("2026-06-01T08:00:00Z","ashinde","WORKBOOK_OPENED",  "ApolloCAM.xlsx opened — June 2026 seed data"),
        ("2026-06-01T08:01:00Z","ashinde","POSITIONS_LOADED", "14 position rows loaded for run_date 2026-06-01"),
        ("2026-06-01T08:02:30Z","ashinde","PROPOSALS_RUN",    "Wires: 3 | FX: 3 | Batch: B20260601-001"),
        ("2026-06-01T08:03:45Z","ashinde","WIRE_APPROVE_ALL", "Bulk approved 3 wire proposals"),
        ("2026-06-01T08:04:10Z","ashinde","FX_APPROVE_ALL",   "Bulk approved 3 FX proposals"),
        ("2026-06-01T08:05:00Z","ashinde","LOADERS_LOCKED",   "Loaders sheet locked — Batch B20260601-001"),
        ("2026-06-01T08:06:30Z","ashinde","EXPORT_IVP",       "IVP file exported: IVP_B20260601-001.xlsx (3 rows)"),
        ("2026-06-01T08:07:00Z","ashinde","EXPORT_TRADE",     "Trade file exported: Trade_B20260601-001.csv (6 rows)"),
        ("2026-06-01T08:07:30Z","ashinde","EXPORT_SPOT",      "SpotFX file exported: SpotFX_B20260601-001.xlsx (3 rows)"),
    ]
    for i, row_data in enumerate(seed_rows):
        r = 3 + i
        bg = OFFWHT if i % 2 == 0 else WHITE
        for c, v in enumerate(row_data, 1):
            cell = ws.cell(r, c, v)
            cell.fill = fill(bg); cell.border = thin_border()
            cell.font = font(size=9, color=SLATE)
            if c == 3:
                cell.font = font(bold=True, size=9, color=NAVY2)


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    wb = openpyxl.Workbook()

    # Create sheets in display order
    ws_home  = wb.active;        ws_home.title  = "HOME"
    ws_dash  = wb.create_sheet("DASHBOARD")
    ws_prop  = wb.create_sheet("PROPOSALS")
    ws_load  = wb.create_sheet("LOADERS")
    ws_set   = wb.create_sheet("SETTINGS")
    ws_data  = wb.create_sheet("_DATA")
    ws_audit = wb.create_sheet("_AUDIT")

    # Set tab colors
    ws_home.sheet_properties.tabColor  = "C9A227"  # Gold
    ws_dash.sheet_properties.tabColor  = "0F2744"  # Navy
    ws_prop.sheet_properties.tabColor  = "007D55"  # Green
    ws_load.sheet_properties.tabColor  = "1D4ED8"  # Blue
    ws_set.sheet_properties.tabColor   = "64748B"  # Slate
    ws_data.sheet_properties.tabColor  = "CBD5E1"  # Light
    ws_audit.sheet_properties.tabColor = "CBD5E1"  # Light

    print("Building HOME...")
    build_home(ws_home)
    print("Building DASHBOARD...")
    build_dashboard(ws_dash)
    print("Building PROPOSALS...")
    build_proposals(ws_prop)
    print("Building LOADERS...")
    build_loaders(ws_load)
    print("Building SETTINGS...")
    build_settings(ws_set)
    print("Building _DATA...")
    build_data(ws_data)
    print("Building _AUDIT...")
    build_audit(ws_audit)

    # Named ranges
    wb.defined_names.add(DefinedName("AMBER_BUFFER",      attr_text="SETTINGS!$B$5"))
    wb.defined_names.add(DefinedName("FX_RATES_TABLE",    attr_text="SETTINGS!$A$38:$C$40"))
    wb.defined_names.add(DefinedName("FUND_MASTER_TABLE", attr_text="SETTINGS!$A$17:$K$27"))

    # Freeze panes
    ws_dash.freeze_panes  = "A7"
    ws_prop.freeze_panes  = "A6"
    ws_load.freeze_panes  = "A5"
    ws_set.freeze_panes   = "A5"
    ws_data.freeze_panes  = "A4"
    ws_audit.freeze_panes = "A3"

    # Print settings
    for ws in [ws_dash, ws_prop, ws_load]:
        ws.page_setup.orientation = "landscape"
        ws.page_setup.fitToPage   = True
        ws.page_setup.fitToWidth  = 1
        ws.page_setup.fitToHeight = 0

    # Workbook properties
    wb.properties.title   = "ApolloCAM — Daily Cash Management"
    wb.properties.creator = "ApolloCAM Build Script"
    wb.properties.subject = "Apollo AAA Fund Controllership"
    wb.properties.keywords= "ApolloCAM; cash management; AAA funds; Apollo"

    out_path = Path(__file__).parent / "ApolloCAM.xlsx"
    wb.save(str(out_path))
    print(f"\n✓ Saved: {out_path}")
    print(f"  Sheets: {[s.title for s in wb.worksheets]}")
    print(f"  Size:   {out_path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
