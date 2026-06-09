Attribute VB_Name = "modApolloCAM"
' =============================================================================
' ApolloCAM — Apollo Cash Automation & Management
' VBA Companion Module — modApolloCAM.bas
' Version: 2.0 | June 2026 | Apollo Global Management, Mumbai
' Owner: Ashitosh Shinde, Associate Director / Controller
'
' ARCHITECTURE RULE: This module is I/O ONLY.
' All business logic (status, deficits, wire amounts, FX proposals) lives in
' workbook formulas. VBA does only: file import, archive, file export,
' Outlook email/calendar, audit log append. EY can trace every calculation
' in the formula bar without running any VBA.
'
' INSTALLATION:
'   1. Open ApolloCAM.xlsx in Excel
'   2. Alt+F11 > File > Import File > select modApolloCAM.bas
'   3. File > Save As > Excel Macro-Enabled Workbook (.xlsm)
'   4. Optional: use Custom UI Editor to embed the Ribbon XML below
'
' RIBBON CUSTOMUI XML (embed in _rels/customUI.xml via Custom UI Editor):
' <customUI xmlns="http://schemas.microsoft.com/office/2009/07/customui">
'   <ribbon><tabs><tab id="tabApollo" label="APOLLO CASH MGMT">
'     <group id="grpData" label="DATA">
'       <button id="btnLoad"    label="Load Data"  onAction="LoadAndRefresh"     imageMso="ImportExcel"/>
'       <button id="btnArchive" label="Archive"    onAction="ArchiveCurrentData" imageMso="FileSave"/>
'     </group>
'     <group id="grpWorkflow" label="WORKFLOW">
'       <button id="btnProposals" label="Proposals"  onAction="GenerateLoaders"  imageMso="LightBulb"/>
'       <button id="btnExportAll" label="Export All" onAction="ExportAllLoaders" imageMso="FileSendAsAttachment"/>
'     </group>
'     <group id="grpNotify" label="NOTIFY">
'       <button id="btnEmail" label="Send Digest"  onAction="SendDailyDigest"    imageMso="MailSendMessage"/>
'       <button id="btnCal"   label="Set Reminder" onAction="SetDailyReminder"   imageMso="CalendarView"/>
'     </group>
'   </tab></tabs></ribbon>
' </customUI>
' =============================================================================

Option Explicit

' ─────────────────────────────────────────────────────────────────────────────
' CONSTANTS
' ─────────────────────────────────────────────────────────────────────────────
Private Const ADMIN_PWD         As String = "ApolloAdmin2026"
Private Const SHEET_DATA        As String = "_DATA"
Private Const SHEET_AUDIT       As String = "_AUDIT"
Private Const SHEET_SETTINGS    As String = "SETTINGS"
Private Const SHEET_LOADERS     As String = "LOADERS"
Private Const SHEET_PROPOSALS   As String = "PROPOSALS"
Private Const SHEET_DASHBOARD   As String = "DASHBOARD"
Private Const SHEET_HOME        As String = "HOME"

' LOADERS sheet section row anchors (v2 structure)
Private Const IVP_FIRST_ROW     As Long = 6
Private Const IVP_LAST_ROW      As Long = 12
Private Const TRADE_FIRST_ROW   As Long = 16
Private Const TRADE_LAST_ROW    As Long = 27   ' 2 legs × 6 wires max = 12 rows
Private Const SPOT_FIRST_ROW    As Long = 31
Private Const SPOT_LAST_ROW     As Long = 37

' DASHBOARD fund data rows
Private Const DASH_FIRST_ROW    As Long = 12
Private Const DASH_LAST_ROW     As Long = 26

' Required headers in the daily position file
Private Const REQ_FUND_CODE     As String = "Fund_Code"
Private Const REQ_CCY           As String = "CCY"
Private Const REQ_BALANCE       As String = "Cash_Balance_Local"
Private Const REQ_DATE          As String = "Report_Date"


' =============================================================================
' ── RIBBON CALLBACKS ──────────────────────────────────────────────────────────
' Public subs with no parameters — invoked by CustomUI ribbon buttons.
' =============================================================================

' Full daily workflow: archive current → import new file → recalc → stamp → notify
Public Sub LoadAndRefresh()
    On Error GoTo ErrHandler
    Application.ScreenUpdating = False

    Call ArchiveCurrentData
    Call ImportPositionFile
    Application.CalculateFullRebuild
    Call SendThresholdAlerts

    Application.ScreenUpdating = True
    LogAudit "LOAD_REFRESH", "Full daily workflow completed"
    MsgBox "Load & Refresh complete. Check HOME tab for status summary.", vbInformation, "ApolloCAM"
    Exit Sub

ErrHandler:
    Application.ScreenUpdating = True
    LogAudit "LOAD_REFRESH_ERROR", "Error " & Err.Number & ": " & Err.Description
    MsgBox "LoadAndRefresh failed: " & Err.Description, vbCritical, "ApolloCAM"
End Sub

' Save a dated copy of the workbook to ./Archive/
Public Sub ArchiveCurrentData()
    On Error GoTo ErrHandler
    Dim archDir As String
    archDir = ThisWorkbook.Path & "\Archive\"
    If Dir(archDir, vbDirectory) = "" Then MkDir archDir

    Dim archFile As String
    archFile = archDir & "ARCHIVE_" & Format(Date, "yyyymmdd") & ".xlsx"
    ThisWorkbook.SaveCopyAs archFile
    LogAudit "ARCHIVE", "Saved to: " & archFile
    Exit Sub

ErrHandler:
    LogAudit "ARCHIVE_ERROR", "Error " & Err.Number & ": " & Err.Description
    MsgBox "Archive failed: " & Err.Description, vbCritical, "ApolloCAM"
End Sub

' Browse for the daily JPM position file, map columns, import into _DATA
Public Sub ImportPositionFile()
    On Error GoTo ErrHandler
    Dim sFile As String
    sFile = Application.GetOpenFilename( _
        FileFilter:="Excel/CSV Files (*.xls*;*.csv),*.xls*;*.csv", _
        Title:="Select Today's Position File")

    If sFile = "False" Then Exit Sub  ' user cancelled

    Dim wbSrc As Workbook
    Set wbSrc = Workbooks.Open(Filename:=sFile, ReadOnly:=True, UpdateLinks:=False)

    Dim wsSrc As Worksheet
    Set wsSrc = wbSrc.Worksheets(1)

    ' Dynamic column mapping
    Dim colMap As Object
    Set colMap = GetColMap(wsSrc)

    ' Validate required headers
    Dim missingHdr As String
    missingHdr = ""
    If Not colMap.Exists(REQ_FUND_CODE) Then missingHdr = missingHdr & REQ_FUND_CODE & ", "
    If Not colMap.Exists(REQ_CCY)       Then missingHdr = missingHdr & REQ_CCY & ", "
    If Not colMap.Exists(REQ_BALANCE)   Then missingHdr = missingHdr & REQ_BALANCE & ", "
    If Not colMap.Exists(REQ_DATE)      Then missingHdr = missingHdr & REQ_DATE & ", "

    If Len(missingHdr) > 0 Then
        wbSrc.Close False
        MsgBox "Position file is missing required columns: " & Left(missingHdr, Len(missingHdr) - 2), _
               vbCritical, "ApolloCAM — Import Error"
        LogAudit "IMPORT_ERROR", "Missing headers: " & missingHdr & " | File: " & sFile
        Exit Sub
    End If

    ' Write to _DATA
    Dim wsData As Worksheet
    Set wsData = ThisWorkbook.Sheets(SHEET_DATA)
    wsData.Unprotect

    wsData.Rows("4:50").ClearContents  ' clear previous positions, preserve formulas in G

    Dim srcLastRow As Long
    srcLastRow = wsSrc.Cells(wsSrc.Rows.Count, ColIdx(colMap, REQ_FUND_CODE)).End(xlUp).Row

    Dim r As Long, destRow As Long
    destRow = 4

    ' Optional columns
    Dim hasAcct As Boolean, hasAcctCol As Integer
    hasAcct = colMap.Exists("Account_Name")
    If hasAcct Then hasAcctCol = colMap("Account_Name")

    For r = 2 To srcLastRow  ' row 1 = header
        Dim fundVal As String
        fundVal = Trim(wsSrc.Cells(r, ColIdx(colMap, REQ_FUND_CODE)).Value)
        If fundVal = "" Then GoTo NextRow

        wsData.Cells(destRow, 1).Value = fundVal                                          ' A: Fund_Code
        wsData.Cells(destRow, 2).Value = IIf(hasAcct, wsSrc.Cells(r, hasAcctCol).Value, "")  ' B: Account_Name
        wsData.Cells(destRow, 3).Value = "JPMORGAN CHASE NA"                              ' C: Bank (static)
        wsData.Cells(destRow, 4).Value = Trim(wsSrc.Cells(r, ColIdx(colMap, REQ_CCY)).Value)  ' D: CCY
        wsData.Cells(destRow, 5).Value = wsSrc.Cells(r, ColIdx(colMap, REQ_BALANCE)).Value    ' E: Cash_Balance_Local
        ' Column F: Report_Date
        wsData.Cells(destRow, 6).Value = wsSrc.Cells(r, ColIdx(colMap, REQ_DATE)).Value
        ' Column G: Functional_USD — formula left in place, auto-recalcs
        destRow = destRow + 1
NextRow:
    Next r

    Dim nRows As Long
    nRows = destRow - 4

    wbSrc.Close False
    Application.CalculateFullRebuild

    ' Stamp HOME as-of date from first Report_Date in _DATA
    If nRows > 0 Then
        Dim asofDate As Variant
        asofDate = wsData.Cells(4, 6).Value
        If IsDate(asofDate) Then
            ThisWorkbook.Sheets(SHEET_HOME).Range("B3").Value = asofDate
        End If
    End If

    wsData.Protect DrawingObjects:=True, Contents:=True, Scenarios:=True
    LogAudit "IMPORT", "File: " & sFile & " | Rows loaded: " & nRows
    MsgBox "Import complete. " & nRows & " position rows loaded.", vbInformation, "ApolloCAM"
    Exit Sub

ErrHandler:
    On Error Resume Next
    If Not wbSrc Is Nothing Then wbSrc.Close False
    If Not wsData Is Nothing Then wsData.Protect DrawingObjects:=True, Contents:=True, Scenarios:=True
    On Error GoTo 0
    LogAudit "IMPORT_ERROR", "Error " & Err.Number & ": " & Err.Description & " | File: " & sFile
    MsgBox "Import failed: " & Err.Description, vbCritical, "ApolloCAM"
End Sub

' Export all three loader sections
Public Sub ExportAllLoaders()
    On Error GoTo ErrHandler
    Call ExportIVP
    Call ExportTrade
    Call ExportSpot
    LogAudit "EXPORT_ALL", "All three loaders exported. Batch: " & NextBatchID()
    MsgBox "All loaders exported to: " & ThisWorkbook.Path & "\Outputs\" & Format(Date, "yyyymmdd") & "\", _
           vbInformation, "ApolloCAM"
    Exit Sub

ErrHandler:
    LogAudit "EXPORT_ALL_ERROR", "Error " & Err.Number & ": " & Err.Description
    MsgBox "Export All failed: " & Err.Description, vbCritical, "ApolloCAM"
End Sub

' Export IVP wire loader section (rows 6-12) as values-only .xlsx
Public Sub ExportIVP()
    On Error GoTo ErrHandler
    Dim outDir As String
    outDir = EnsureOutputDir()

    Dim wsL As Worksheet
    Set wsL = ThisWorkbook.Sheets(SHEET_LOADERS)

    ' Find last non-empty row in the IVP section
    Dim lastRow As Long
    lastRow = IVP_FIRST_ROW
    Dim r As Long
    For r = IVP_FIRST_ROW To IVP_LAST_ROW
        If wsL.Cells(r, 1).Value <> "" Then lastRow = r
    Next r

    Dim rng As Range
    Set rng = wsL.Range(wsL.Rows(IVP_FIRST_ROW - 1), wsL.Rows(lastRow))  ' include header row above

    Dim batchID As String
    batchID = NextBatchID()
    Dim sFile As String
    sFile = outDir & "IVP_" & batchID & ".xlsx"

    Dim wbOut As Workbook
    Set wbOut = Workbooks.Add
    rng.Copy
    wbOut.Worksheets(1).Range("A1").PasteSpecial xlPasteValues
    wbOut.Worksheets(1).Range("A1").PasteSpecial xlPasteFormats
    wbOut.Worksheets(1).Name = "IVP_Wire_Loader"
    Application.CutCopyMode = False
    wbOut.SaveAs Filename:=sFile, FileFormat:=xlOpenXMLWorkbook
    wbOut.Close False

    Dim nRows As Long
    nRows = lastRow - IVP_FIRST_ROW + 1
    LogAudit "EXPORT_IVP", "File: " & sFile & " | Rows: " & nRows & " | Batch: " & batchID
    Exit Sub

ErrHandler:
    On Error Resume Next
    If Not wbOut Is Nothing Then wbOut.Close False
    On Error GoTo 0
    LogAudit "EXPORT_IVP_ERROR", "Error " & Err.Number & ": " & Err.Description
    MsgBox "ExportIVP failed: " & Err.Description, vbCritical, "ApolloCAM"
End Sub

' Export trade booking loader as CSV
Public Sub ExportTrade()
    On Error GoTo ErrHandler
    Dim outDir As String
    outDir = EnsureOutputDir()

    Dim wsL As Worksheet
    Set wsL = ThisWorkbook.Sheets(SHEET_LOADERS)

    Dim lastRow As Long
    lastRow = TRADE_FIRST_ROW
    Dim r As Long
    For r = TRADE_FIRST_ROW To TRADE_LAST_ROW
        If wsL.Cells(r, 1).Value <> "" Then lastRow = r
    Next r

    Dim rng As Range
    Set rng = wsL.Range(wsL.Rows(TRADE_FIRST_ROW - 1), wsL.Rows(lastRow))

    Dim batchID As String
    batchID = NextBatchID()
    Dim sFile As String
    sFile = outDir & "Trade_" & batchID & ".csv"

    Dim wbOut As Workbook
    Set wbOut = Workbooks.Add
    rng.Copy
    wbOut.Worksheets(1).Range("A1").PasteSpecial xlPasteValues
    Application.CutCopyMode = False
    wbOut.SaveAs Filename:=sFile, FileFormat:=xlCSV
    wbOut.Close False

    Dim nRows As Long
    nRows = lastRow - TRADE_FIRST_ROW + 1
    LogAudit "EXPORT_TRADE", "File: " & sFile & " | Rows: " & nRows & " | Batch: " & batchID
    Exit Sub

ErrHandler:
    On Error Resume Next
    If Not wbOut Is Nothing Then wbOut.Close False
    On Error GoTo 0
    LogAudit "EXPORT_TRADE_ERROR", "Error " & Err.Number & ": " & Err.Description
    MsgBox "ExportTrade failed: " & Err.Description, vbCritical, "ApolloCAM"
End Sub

' Export Spot FX loader as values-only .xlsx
Public Sub ExportSpot()
    On Error GoTo ErrHandler
    Dim outDir As String
    outDir = EnsureOutputDir()

    Dim wsL As Worksheet
    Set wsL = ThisWorkbook.Sheets(SHEET_LOADERS)

    Dim lastRow As Long
    lastRow = SPOT_FIRST_ROW
    Dim r As Long
    For r = SPOT_FIRST_ROW To SPOT_LAST_ROW
        If wsL.Cells(r, 1).Value <> "" Then lastRow = r
    Next r

    Dim rng As Range
    Set rng = wsL.Range(wsL.Rows(SPOT_FIRST_ROW - 1), wsL.Rows(lastRow))

    Dim batchID As String
    batchID = NextBatchID()
    Dim sFile As String
    sFile = outDir & "SpotFX_" & batchID & ".xlsx"

    Dim wbOut As Workbook
    Set wbOut = Workbooks.Add
    rng.Copy
    wbOut.Worksheets(1).Range("A1").PasteSpecial xlPasteValues
    wbOut.Worksheets(1).Range("A1").PasteSpecial xlPasteFormats
    wbOut.Worksheets(1).Name = "SpotFX_Loader"
    Application.CutCopyMode = False
    wbOut.SaveAs Filename:=sFile, FileFormat:=xlOpenXMLWorkbook
    wbOut.Close False

    Dim nRows As Long
    nRows = lastRow - SPOT_FIRST_ROW + 1
    LogAudit "EXPORT_SPOT", "File: " & sFile & " | Rows: " & nRows & " | Batch: " & batchID
    Exit Sub

ErrHandler:
    On Error Resume Next
    If Not wbOut Is Nothing Then wbOut.Close False
    On Error GoTo 0
    LogAudit "EXPORT_SPOT_ERROR", "Error " & Err.Number & ": " & Err.Description
    MsgBox "ExportSpot failed: " & Err.Description, vbCritical, "ApolloCAM"
End Sub

' Send HTML digest email via Outlook (late binding) to DL + controller
Public Sub SendDailyDigest()
    On Error GoTo ErrHandler
    If Not GetSettingBool("DIGEST_ENABLED") Then
        MsgBox "Digest is disabled in Settings (DIGEST_ENABLED = False).", vbInformation, "ApolloCAM"
        Exit Sub
    End If

    Dim olApp As Object
    Set olApp = CreateObject("Outlook.Application")
    Dim mail As Object
    Set mail = olApp.CreateItem(0)  ' olMailItem = 0

    mail.To = GetSetting("DL_EMAIL")
    mail.CC = GetSetting("CONTROLLER_EMAIL")
    mail.Subject = "ApolloCAM Daily Digest " & Format(Date, "dd-mmm-yyyy")
    mail.HTMLBody = BuildDigestHTML()
    mail.Send

    LogAudit "DIGEST_SENT", "To: " & GetSetting("DL_EMAIL") & " | CC: " & GetSetting("CONTROLLER_EMAIL")
    MsgBox "Daily digest sent successfully.", vbInformation, "ApolloCAM"
    Exit Sub

ErrHandler:
    LogAudit "DIGEST_ERROR", "Error " & Err.Number & ": " & Err.Description
    MsgBox "SendDailyDigest failed: " & Err.Description & vbCrLf & _
           "Ensure Outlook is running and configured.", vbCritical, "ApolloCAM"
End Sub

' Send per-fund breach alerts — de-duped by MAX_ALERTS_PER_FUND_PER_DAY
Public Sub SendThresholdAlerts()
    On Error GoTo ErrHandler
    If Not GetSettingBool("ALERT_ONLY_WHEN_RED") Then Exit Sub

    Dim wsD As Worksheet
    Set wsD = ThisWorkbook.Sheets(SHEET_DASHBOARD)

    Dim maxAlerts As Long
    maxAlerts = CLng(GetSetting("MAX_ALERTS_PER_FUND_PER_DAY"))
    If maxAlerts < 1 Then maxAlerts = 1

    Dim r As Long
    For r = DASH_FIRST_ROW To DASH_LAST_ROW
        Dim fundCode As String
        fundCode = Trim(wsD.Cells(r, 2).Value)  ' Column B = Fund_Code
        If fundCode = "" Then GoTo NextFund

        Dim status As String
        status = Trim(wsD.Cells(r, 8).Value)    ' Column H = Status
        If status <> "RED" Then GoTo NextFund

        If AlreadyAlertedToday(fundCode) Then GoTo NextFund

        Dim deficit As Double
        deficit = 0
        Dim cashVal As Variant
        cashVal = wsD.Cells(r, 5).Value          ' Column E = Cash (USD)
        Dim floorVal As Variant
        floorVal = wsD.Cells(r, 6).Value         ' Column F = Floor
        If IsNumeric(cashVal) And IsNumeric(floorVal) Then
            deficit = CDbl(floorVal) - CDbl(cashVal)
        End If

        ' Send alert email
        Dim olApp As Object
        On Error Resume Next
        Set olApp = CreateObject("Outlook.Application")
        On Error GoTo ErrHandler
        If Not olApp Is Nothing Then
            Dim mail As Object
            Set mail = olApp.CreateItem(0)
            mail.To = GetSetting("DL_EMAIL")
            mail.CC = GetSetting("CONTROLLER_EMAIL")
            mail.Subject = "[ALERT] ApolloCAM: " & fundCode & " is RED — " & Format(Date, "dd-mmm-yyyy")
            mail.HTMLBody = BuildAlertHTML(fundCode, deficit)
            mail.Send
            Set mail = Nothing
            Set olApp = Nothing
        End If

        LogAudit "ALERT", fundCode & " | Status: RED | Deficit: $" & Format(deficit, "#,##0")
NextFund:
    Next r
    Exit Sub

ErrHandler:
    LogAudit "ALERT_ERROR", "Error " & Err.Number & ": " & Err.Description
End Sub

' Create a recurring weekday 9am Outlook calendar reminder
Public Sub SetDailyReminder()
    On Error GoTo ErrHandler
    Dim olApp As Object
    Set olApp = CreateObject("Outlook.Application")
    Dim appt As Object
    Set appt = olApp.CreateItem(1)  ' olAppointmentItem = 1

    appt.Subject = "ApolloCAM Daily Cash Review"
    appt.Body = "Load position file, review fund statuses, approve proposals, export loaders."
    appt.Start = Date & " 09:00:00"
    appt.Duration = 30
    appt.ReminderMinutesBeforeStart = 5
    appt.ReminderSet = True
    appt.RecurrenceState = 1  ' olApptMaster
    Dim rec As Object
    Set rec = appt.GetRecurrencePattern()
    rec.RecurrenceType = 1     ' olRecursWeekly
    rec.DayOfWeekMask = 62     ' Mon(2)+Tue(4)+Wed(8)+Thu(16)+Fri(32) = 62
    rec.NoEndDate = True
    appt.Save

    LogAudit "REMINDER_SET", "Daily weekday 9am reminder created in Outlook"
    MsgBox "Daily reminder set: weekdays at 9:00am.", vbInformation, "ApolloCAM"
    Exit Sub

ErrHandler:
    LogAudit "REMINDER_ERROR", "Error " & Err.Number & ": " & Err.Description
    MsgBox "SetDailyReminder failed: " & Err.Description, vbCritical, "ApolloCAM"
End Sub


' =============================================================================
' ── WORKER SUBS ──────────────────────────────────────────────────────────────
' =============================================================================

' Verify approvals exist, then lock LOADERS sheet against accidental edits
Public Sub GenerateLoaders()
    On Error GoTo ErrHandler
    Dim wsP As Worksheet
    Set wsP = ThisWorkbook.Sheets(SHEET_PROPOSALS)

    ' Check at least one APPROVE in proposals (SUMIF on action column J, rows 6-22)
    Dim approvedCount As Long
    approvedCount = WorksheetFunction.CountIf( _
        wsP.Range("J6:J22"), "APPROVE")

    If approvedCount = 0 Then
        MsgBox "No APPROVE decisions found in Proposals. " & _
               "Please set at least one proposal to APPROVE before generating loaders.", _
               vbExclamation, "ApolloCAM"
        Exit Sub
    End If

    Application.CalculateFullRebuild

    ' Lock LOADERS sheet
    Dim wsL As Worksheet
    Set wsL = ThisWorkbook.Sheets(SHEET_LOADERS)
    wsL.Protect DrawingObjects:=True, Contents:=True, Scenarios:=True

    LogAudit "LOADERS_LOCKED", "Batch: " & NextBatchID() & " | Approved rows: " & approvedCount
    MsgBox "Loaders generated and sheet locked. " & _
           "Use Export All to create the output files.", vbInformation, "ApolloCAM"
    Exit Sub

ErrHandler:
    LogAudit "GENERATE_LOADERS_ERROR", "Error " & Err.Number & ": " & Err.Description
    MsgBox "GenerateLoaders failed: " & Err.Description, vbCritical, "ApolloCAM"
End Sub

' Admin-password-gated unlock of LOADERS sheet for re-generation
Public Sub UnlockLoaders()
    On Error GoTo ErrHandler
    Dim enteredPwd As String
    enteredPwd = InputBox("Enter admin password to unlock LOADERS:", "ApolloCAM Admin")

    If enteredPwd = "" Then
        LogAudit "UNLOCK_CANCELLED", "User cancelled unlock attempt"
        Exit Sub
    End If

    If enteredPwd <> ADMIN_PWD Then
        LogAudit "UNLOCK_FAILED", "Incorrect admin password entered by: " & Environ("USERNAME")
        MsgBox "Incorrect password. Unlock denied.", vbCritical, "ApolloCAM"
        Exit Sub
    End If

    Dim wsL As Worksheet
    Set wsL = ThisWorkbook.Sheets(SHEET_LOADERS)
    wsL.Unprotect

    LogAudit "LOADERS_UNLOCKED", "Unlocked by: " & Environ("USERNAME")
    MsgBox "LOADERS sheet unlocked. Make changes, then run Generate Loaders again.", _
           vbInformation, "ApolloCAM"
    Exit Sub

ErrHandler:
    LogAudit "UNLOCK_ERROR", "Error " & Err.Number & ": " & Err.Description
    MsgBox "UnlockLoaders failed: " & Err.Description, vbCritical, "ApolloCAM"
End Sub


' =============================================================================
' ── HELPERS — SETTINGS ───────────────────────────────────────────────────────
' =============================================================================

' Read a named setting from SETTINGS sheet column A (key) / B (value)
Public Function GetSetting(key As String) As String
    On Error GoTo ErrHandler
    Dim wsS As Worksheet
    Set wsS = ThisWorkbook.Sheets(SHEET_SETTINGS)

    ' Search column A for key, return column B
    Dim foundRow As Variant
    foundRow = Application.Match(key, wsS.Range("A1:A30"), 0)
    If IsError(foundRow) Then
        GetSetting = ""
        Exit Function
    End If

    GetSetting = Trim(CStr(wsS.Cells(CLng(foundRow), 2).Value))
    Exit Function

ErrHandler:
    GetSetting = ""
End Function

' Return Boolean from a settings key ("True"/"False")
Public Function GetSettingBool(key As String) As Boolean
    GetSettingBool = (LCase(Trim(GetSetting(key))) = "true")
End Function


' =============================================================================
' ── HELPERS — COLUMN MAPPING ─────────────────────────────────────────────────
' =============================================================================

' Build a Dictionary mapping header text -> column index for a worksheet.
' Used by ImportPositionFile to handle variable column order in daily files.
Public Function GetColMap(ws As Worksheet) As Object
    Dim map As Object
    Set map = CreateObject("Scripting.Dictionary")
    map.CompareMode = vbTextCompare  ' case-insensitive header matching

    Dim lastCol As Long
    lastCol = ws.Cells(1, ws.Columns.Count).End(xlToLeft).Column

    Dim c As Long
    For c = 1 To lastCol
        Dim h As String
        h = Trim(CStr(ws.Cells(1, c).Value))
        If h <> "" Then
            If Not map.Exists(h) Then map(h) = c
        End If
    Next c

    Set GetColMap = map
End Function

' Return column index for a header key. Returns 0 if not found.
Public Function ColIdx(map As Object, header As String) As Long
    If map.Exists(header) Then
        ColIdx = map(header)
    Else
        ColIdx = 0
    End If
End Function


' =============================================================================
' ── HELPERS — EMAIL BODY BUILDERS ────────────────────────────────────────────
' =============================================================================

' Build HTML body for the daily digest email.
' Reads data from DASHBOARD formulas — no calculations here.
Public Function BuildDigestHTML() As String
    Dim wsD As Worksheet
    Set wsD = ThisWorkbook.Sheets(SHEET_DASHBOARD)

    Dim html As String
    html = "<!DOCTYPE html><html><body style='font-family:Calibri,sans-serif;font-size:10pt;color:#1E293B'>"
    html = html & "<table style='border-collapse:collapse;width:100%;max-width:700px;'>"
    html = html & "<tr><td colspan='7' style='background:#0F2744;color:#fff;font-size:16pt;font-weight:bold;" & _
                  "padding:12px 16px;'>ApolloCAM Daily Cash Status</td></tr>"
    html = html & "<tr><td colspan='7' style='background:#1E3A5F;color:#94A3B8;font-size:9pt;padding:4px 16px;'>" & _
                  Format(Date, "dd-mmm-yyyy") & " | Generated by: " & Environ("USERNAME") & "</td></tr>"
    html = html & "<tr style='background:#1E3A5F;color:#fff;font-size:9pt;'>"
    html = html & "<th style='padding:6px 10px;text-align:left;'>Fund</th>"
    html = html & "<th style='padding:6px 10px;text-align:right;'>Cash (USD)</th>"
    html = html & "<th style='padding:6px 10px;text-align:right;'>Floor</th>"
    html = html & "<th style='padding:6px 10px;text-align:right;'>Ceiling</th>"
    html = html & "<th style='padding:6px 10px;text-align:center;'>Status</th>"
    html = html & "<th style='padding:6px 10px;text-align:right;'>Surplus/(Deficit)</th>"
    html = html & "</tr>"

    Dim r As Long
    Dim rowBg As String
    For r = DASH_FIRST_ROW To DASH_LAST_ROW
        Dim fundCode As String
        fundCode = Trim(CStr(wsD.Cells(r, 2).Value))  ' B = Fund_Code
        If fundCode = "" Then GoTo NextDashRow

        Dim fundName As String
        fundName = Trim(CStr(wsD.Cells(r, 3).Value))  ' C = Fund_Name
        Dim cashUSD As Variant: cashUSD = wsD.Cells(r, 5).Value   ' E
        Dim floorAmt As Variant: floorAmt = wsD.Cells(r, 6).Value  ' F
        Dim ceilAmt As Variant: ceilAmt = wsD.Cells(r, 7).Value    ' G
        Dim statusVal As String
        statusVal = Trim(CStr(wsD.Cells(r, 8).Value))              ' H

        Dim surplus As Double
        surplus = 0
        If IsNumeric(cashUSD) And IsNumeric(floorAmt) Then
            surplus = CDbl(cashUSD) - CDbl(floorAmt)
        End If

        rowBg = "#F8FAFC"
        If r Mod 2 = 0 Then rowBg = "#FFFFFF"

        Dim statusColor As String
        Select Case statusVal
            Case "RED":   statusColor = "#FEE2E2;color:#991B1B"
            Case "AMBER": statusColor = "#FEF3C7;color:#92400E"
            Case "GREEN": statusColor = "#DCFCE7;color:#053520"
            Case "BLUE":  statusColor = "#DBEAFE;color:#1E40AF"
            Case Else:    statusColor = "#F1F5F9;color:#475569"
        End Select

        html = html & "<tr style='background:" & rowBg & ";'>"
        html = html & "<td style='padding:5px 10px;font-size:9pt;'>" & fundCode & "</td>"
        html = html & "<td style='padding:5px 10px;text-align:right;font-size:9pt;'>" & _
                      FormatCurrency(cashUSD) & "</td>"
        html = html & "<td style='padding:5px 10px;text-align:right;font-size:9pt;'>" & _
                      FormatCurrency(floorAmt) & "</td>"
        html = html & "<td style='padding:5px 10px;text-align:right;font-size:9pt;'>" & _
                      FormatCurrency(ceilAmt) & "</td>"
        html = html & "<td style='padding:5px 10px;text-align:center;'><span style='background:" & _
                      statusColor & ";padding:2px 8px;border-radius:10px;font-size:8pt;" & _
                      "font-weight:bold;'>" & statusVal & "</span></td>"
        html = html & "<td style='padding:5px 10px;text-align:right;font-size:9pt;" & _
                      IIf(surplus < 0, "color:#991B1B;font-weight:bold;", "") & "'>" & _
                      FormatCurrency(surplus) & "</td>"
        html = html & "</tr>"
NextDashRow:
    Next r

    html = html & "</table>"
    html = html & "<p style='font-size:8pt;color:#94A3B8;margin-top:16px;'>This is an automated message from ApolloCAM. " & _
                  "Audit log available in the _AUDIT sheet.</p>"
    html = html & "</body></html>"

    BuildDigestHTML = html
End Function

' Build HTML body for a single RED-fund alert email
Public Function BuildAlertHTML(fundCode As String, deficit As Double) As String
    Dim html As String
    html = "<!DOCTYPE html><html><body style='font-family:Calibri,sans-serif;font-size:10pt;color:#1E293B'>"
    html = html & "<table style='border-collapse:collapse;max-width:600px;width:100%;'>"
    html = html & "<tr><td style='background:#DC2626;color:#fff;font-size:14pt;font-weight:bold;" & _
                  "padding:12px 16px;'>CASH ALERT: " & fundCode & " is RED</td></tr>"
    html = html & "<tr><td style='background:#FEE2E2;padding:10px 16px;'>"
    html = html & "<p><b>Fund:</b> " & fundCode & "</p>"
    html = html & "<p><b>Status:</b> <span style='color:#991B1B;font-weight:bold;'>RED — Below Minimum Floor</span></p>"
    html = html & "<p><b>Deficit:</b> <span style='color:#DC2626;font-weight:bold;'>$" & _
                  Format(deficit, "#,##0") & "</span></p>"
    html = html & "<p><b>Date:</b> " & Format(Date, "dd-mmm-yyyy") & "</p>"
    html = html & "<p>Please review proposals in ApolloCAM and approve a wire transfer to restore this fund to floor.</p>"
    html = html & "</td></tr>"
    html = html & "<tr><td style='padding:10px 16px;font-size:8pt;color:#94A3B8;'>ApolloCAM automated alert. " & _
                  "Do not reply to this email.</td></tr>"
    html = html & "</table></body></html>"
    BuildAlertHTML = html
End Function


' =============================================================================
' ── HELPERS — DEDUP + BATCH ──────────────────────────────────────────────────
' =============================================================================

' Check if an ALERT has already been sent today for this fund.
' Uses Int(Now()) for date comparison — locale-safe, no string format dependency.
Public Function AlreadyAlertedToday(fundCode As String) As Boolean
    On Error GoTo ErrHandler
    Dim wsA As Worksheet
    Set wsA = ThisWorkbook.Sheets(SHEET_AUDIT)

    Dim todayInt As Long
    todayInt = Int(Now())  ' integer part of date serial = today's date serial

    Dim lastR As Long
    lastR = wsA.Cells(wsA.Rows.Count, 1).End(xlUp).Row

    Dim r As Long
    For r = lastR To 2 Step -1  ' newest first for performance
        Dim cellTs As Variant
        cellTs = wsA.Cells(r, 1).Value
        If Not IsDate(cellTs) Then GoTo NextAuditRow

        If Int(CDbl(cellTs)) < todayInt Then Exit For  ' passed today's boundary, stop

        Dim actionVal As String
        actionVal = CStr(wsA.Cells(r, 3).Value)
        Dim detailVal As String
        detailVal = CStr(wsA.Cells(r, 4).Value)

        If InStr(1, actionVal, "ALERT", vbTextCompare) > 0 Then
            If InStr(1, detailVal, fundCode, vbTextCompare) > 0 Then
                AlreadyAlertedToday = True
                Exit Function
            End If
        End If
NextAuditRow:
    Next r

    AlreadyAlertedToday = False
    Exit Function

ErrHandler:
    AlreadyAlertedToday = False  ' on error, allow the alert to send
End Function

' Generate batch ID for today. Format: B{yyyymmdd}-001
' Scans _AUDIT to increment suffix if a batch was already generated today.
Public Function NextBatchID() As String
    Dim baseID As String
    baseID = "B" & Format(Date, "yyyymmdd")

    Dim wsA As Worksheet
    Set wsA = ThisWorkbook.Sheets(SHEET_AUDIT)

    Dim maxSeq As Long
    maxSeq = 0
    Dim lastR As Long
    lastR = wsA.Cells(wsA.Rows.Count, 4).End(xlUp).Row

    Dim r As Long
    For r = 2 To lastR
        Dim detail As String
        detail = CStr(wsA.Cells(r, 4).Value)
        If InStr(detail, baseID) > 0 Then
            ' Extract sequence number from "Batch: B20260601-002"
            Dim pos As Long
            pos = InStr(detail, baseID & "-")
            If pos > 0 Then
                Dim seqStr As String
                seqStr = Mid(detail, pos + Len(baseID) + 1, 3)
                If IsNumeric(seqStr) Then
                    If CLng(seqStr) > maxSeq Then maxSeq = CLng(seqStr)
                End If
            End If
        End If
    Next r

    NextBatchID = baseID & "-" & Format(maxSeq + 1, "000")
End Function


' =============================================================================
' ── AUDIT ────────────────────────────────────────────────────────────────────
' =============================================================================

' Append one row to _AUDIT: Timestamp | Username | Action | Detail
' This sub temporarily unprotects and re-protects the sheet.
' _AUDIT is the only sheet VBA writes to without an admin password check.
Public Sub LogAudit(action As String, detail As String)
    On Error Resume Next  ' audit must never crash the caller
    Dim wsA As Worksheet
    Set wsA = ThisWorkbook.Sheets(SHEET_AUDIT)
    If wsA Is Nothing Then Exit Sub

    wsA.Unprotect
    Dim r As Long
    r = wsA.Cells(wsA.Rows.Count, 1).End(xlUp).Row + 1
    wsA.Cells(r, 1).Value = Now()           ' A: Timestamp
    wsA.Cells(r, 1).NumberFormat = "dd-mmm-yyyy hh:mm:ss"
    wsA.Cells(r, 2).Value = Environ("USERNAME")  ' B: Windows username
    wsA.Cells(r, 3).Value = action          ' C: Action
    wsA.Cells(r, 4).Value = detail          ' D: Detail

    wsA.Protect DrawingObjects:=True, Contents:=True, Scenarios:=True
    On Error GoTo 0
End Sub


' =============================================================================
' ── PRIVATE HELPERS ──────────────────────────────────────────────────────────
' =============================================================================

' Ensure ./Outputs/yyyymmdd/ folder exists, return the path with trailing \
Private Function EnsureOutputDir() As String
    Dim outRoot As String
    outRoot = ThisWorkbook.Path & "\Outputs\"
    If Dir(outRoot, vbDirectory) = "" Then MkDir outRoot

    Dim outDay As String
    outDay = outRoot & Format(Date, "yyyymmdd") & "\"
    If Dir(outDay, vbDirectory) = "" Then MkDir outDay

    EnsureOutputDir = outDay
End Function

' Format a numeric value as currency string for HTML emails
Private Function FormatCurrency(v As Variant) As String
    If IsNumeric(v) Then
        If CDbl(v) < 0 Then
            FormatCurrency = "($" & Format(Abs(CDbl(v)), "#,##0") & ")"
        ElseIf CDbl(v) = 0 Then
            FormatCurrency = "-"
        Else
            FormatCurrency = "$" & Format(CDbl(v), "#,##0")
        End If
    Else
        FormatCurrency = "-"
    End If
End Function
