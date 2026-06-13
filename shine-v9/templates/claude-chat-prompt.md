# Use Claude (claude.ai) to convert your draft FS into SHINE inputs

This is the no-code shortcut. Open **claude.ai** in your browser, **upload your
draft FS PDF and tie-out workbook**, and paste the prompt below into the chat.
Claude returns four ready-to-save JSON files. Save each into your review
folder's `inputs/` directory and SHINE will read them.

---

## The prompt (copy everything below, paste into Claude)

You are helping me prepare inputs for a deterministic financial-statement
review engine. I have attached the draft FS and the tie-out workbook. Read
them and return FOUR JSON objects, each in its own fenced code block, in this
order:

1. `figures.json` — the numbers, in the structure described in this template:
   `{entity: {...}, balance_sheet: {assets, liabilities, partners_capital},
   schedule_of_investments: {positions[], total_fair_value, total_cost,
   level_totals}, statement_of_operations: {investment_income, expenses,
   net_investment_income, net_realized_gain, net_change_unrealized,
   net_increase_in_partners_capital}, statement_of_changes:
   {beginning_capital, contributions, distributions, allocation_net_increase,
   ending_capital, by_class?}, cash_flows: {present, beginning_cash,
   net_change_in_cash, ending_cash} (or {present: false} if elected out),
   financial_highlights: {nav_per_unit, average_capital, expense_ratio,
   nii_ratio}, tie_out: {dotted-path: value-from-workbook}}`

2. `notes.json` — every note as `{notes: [{id, title, text}]}`, with the full
   text of each note pasted into the `text` field.

3. `_FUND-METADATA.json` — `{fund_code, legal_name, domicile, structure_type,
   presentation: {framework: "ASC946" or "IFRS" or "USGAAP", currency},
   regulatory_jurisdictions: [...], fiscal_year_end, formed_after_2020,
   adviser_sec_registered, liquidating, policy_change_in_period,
   materiality: {planning_pct_of_nav}}`. Set framework based on the
   reporting basis stated in the policies note. Use `false` for the
   boolean flags unless the statements indicate otherwise.

4. `_REVIEW-MANIFEST.json` — `{review_id, period, draft, reviewer,
   inputs: {figures: "figures.json", notes: "notes.json", metadata:
   "_FUND-METADATA.json"}}`. Use the controller email I give you, or
   "reviewer@example.com" if I do not.

Rules I need you to follow:

- Numbers are absolute (no thousands abbreviations). $1,234,567 is `1234567`.
- Ratios are decimal fractions. 3.63 percent is `0.0363`.
- Negatives stay negative. Distributions are typically negative numbers.
- Use the EXACT field names above. If a section is absent from the FS, omit
  it from the JSON; do not invent values.
- For positions in the schedule of investments: name, industry, type (one of:
  equity, debt, derivative, fund), fair_value, cost, level (1, 2, or 3).
- For `tie_out`: pick the top-line totals from the workbook and key them by
  the dotted path into figures.json (e.g.
  `balance_sheet.assets.total_assets`, `schedule_of_investments.total_fair_value`,
  `statement_of_changes.ending_capital`). A mismatch between figures and
  tie_out becomes a finding, which is what we want.
- If you are not certain about a value, copy the most-likely candidate AND
  note your uncertainty in a one-line comment ABOVE the code block (not
  inside the JSON; JSON does not allow comments).
- Output NOTHING outside the four fenced JSON blocks plus those optional
  one-line uncertainty notes. No prose summary, no explanation.

---

## After Claude responds

1. Copy the contents of each fenced block into a file with the matching name
   inside your review folder's `inputs/` directory.
2. Run `python3 -m harness.preflight your-review-folder` to validate the
   inputs without running the engine. Fix any ERROR lines before continuing.
3. Run `python3 run_review.py your-review-folder`. Open
   `your-review-folder/_outputs/dashboard.html` in your browser.

If a number is wrong in the JSON, SHINE will catch it as a tie-out break or a
footing break, so the workflow self-checks. You can iterate: fix the JSON
and re-run.
