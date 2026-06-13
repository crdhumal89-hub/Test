# SHINE Quick Start for Non-Coders

You can get your first review running in under 30 minutes. No programming
required. This guide assumes you have **never run a Python script before**.
If you have, skip to step 4.

## What you will end up with

A folder on your computer where you drop your draft FS information, run one
command, and open an HTML dashboard in your browser showing every finding
(arithmetic breaks, missing disclosures, missing citations, regulatory gaps),
plus two PDFs you can email to the preparer or to the auditor.

## Plain-English answers to your three questions

**"Is this just Python or will Claude agents actually use the LLM live?"**

Both, your choice. Two modes:

- **Rule-based mode (the default).** Pure Python rules. No internet, no API
  key, no AI. Catches every arithmetic break with exact numbers, walks the
  framework disclosure checklist, runs the regulatory checks. Free. Fast
  (under a second). This is what 80 percent of the value is.
- **Live Claude mode (opt-in).** Same rule engine runs FIRST, then a live
  Claude model is asked to add additional judgment findings the rules might
  have missed. Costs a few cents per review. Needs an Anthropic API key.
  Findings the model invents that cite fake authority are automatically
  rejected before you see them.

You can start in rule-based mode today; switch on live Claude when you want
to.

**"How do I input files?"**

Not the PDF directly. SHINE eats structured JSON files (figures, notes,
metadata). Three ways to produce them, ranked by how easy:

1. **Easiest: have Claude do it.** Open claude.ai in your browser, upload
   your draft FS PDF and tie-out workbook, and paste the prompt from
   `templates/claude-chat-prompt.md`. Claude returns the four JSON files you
   save into your review folder. Roughly 5 minutes per draft.
2. Fill in `templates/figures.template.json` by hand from the PDF. Tedious
   but precise for small statements.
3. Wire up your own extraction pipeline. For your team's quarter-end, this
   is the real long-term answer; for today, use option 1.

**"Where will I see the results?"**

After running one command, a `_outputs/` folder appears inside your review
folder containing:

- `dashboard.html` — double-click to open in your browser. Statement-grouped
  findings, readiness banner (READY green / NOT READY red), CFO summary at
  the top, one card per finding with the recommended fix.
- `preparer_export.pdf` — what you send the fund administrator.
- `audit_file_export.pdf` — what you send the auditor.
- A bunch of supporting files (ledger, coverage manifest, decision logs) —
  ignore them unless an auditor asks.

---

## Step 1: install Python (one time, 5 minutes)

You probably already have it. Open Terminal (Mac) or Command Prompt (Windows)
and type:

```
python3 --version
```

If you see `Python 3.11` or higher, skip to step 2. Otherwise:

- **Mac**: open the App Store, install "Python" by python.org, or run in
  Terminal: `xcode-select --install`. Then download Python 3.11+ from
  python.org and run the installer.
- **Windows**: go to **python.org/downloads**, click the big yellow button,
  run the installer, **check "Add Python to PATH"** on the first screen.

Re-open Terminal / Command Prompt and run `python3 --version` again.

## Step 2: download the SHINE engine (one time, 1 minute)

If you already cloned the repo, your `shine-v9/` folder is what you need.
Otherwise download it from your repository (whoever owns the SHINE GitHub
repo can send you the ZIP).

Place the `shine-v9` folder anywhere you like; this guide assumes
`~/shine-v9/` on Mac or `C:\shine-v9\` on Windows.

## Step 3: run the demo to confirm everything works (2 minutes)

In Terminal / Command Prompt:

```
cd ~/shine-v9            # Mac/Linux
cd C:\shine-v9           # Windows
python3 -m unittest discover -s tests
```

You should see `Ran 155 tests in 0.X seconds  OK`. If you see `FAILED`,
something is wrong with your Python install; do not continue.

Now run the demo review on a clean reference fund:

```
python3 run_review.py golden/clean_asc946
```

You should see a one-liner like
`SHINE v9 run abc...: 0 findings, READY (no unresolved...)`.

**Open `golden/clean_asc946/_outputs/dashboard.html` in your browser.** This
is what every review you run will look like. Try the dashboard buttons: the
Accept / Resolve / Discard actions persist in your browser.

## Step 4: prepare YOUR fund's review folder (5 minutes)

Create a new folder anywhere. Inside it, create a subfolder called `inputs`.
On Mac/Linux:

```
mkdir -p ~/my-reviews/AAA-FUND-A/Draft-1/inputs
```

Copy the four template files from `shine-v9/templates/` into that `inputs`
folder, renaming them to drop the `.template`:

| Copy this template | To this filename |
|---|---|
| `figures.template.json` | `inputs/figures.json` |
| `notes.template.json` | `inputs/notes.json` |
| `_FUND-METADATA.template.json` | `inputs/_FUND-METADATA.json` |
| `_REVIEW-MANIFEST.template.json` | `inputs/_REVIEW-MANIFEST.json` |

## Step 5: fill in your fund's numbers (5–20 minutes)

**Easy path: use Claude to do it.** Open **claude.ai** in your browser. In a
new chat, upload your draft FS PDF and the tie-out workbook (drag and drop).
Then open `shine-v9/templates/claude-chat-prompt.md` in any text editor,
copy its contents, and paste into Claude. Claude returns four code blocks.
Copy each block's contents into the matching file in your `inputs/` folder,
**overwriting** the templates.

**Tedious path: type from the PDF.** Open each template in any text editor
(Notepad, TextEdit in plain-text mode, or VS Code) and replace the
placeholder values with your numbers. Delete every line that starts with
`__` before saving — those are instructions, not data.

**Either path: ratios are decimals.** An expense ratio of 3.63 percent is
`0.0363`, not `3.63` (the engine treats anything >= 1 as a likely error and
warns you).

## Step 6: pre-flight check (1 minute)

This validates your inputs without running the engine, so you see input
mistakes at your desk instead of mid-run:

```
python3 -m harness.preflight ~/my-reviews/AAA-FUND-A/Draft-1
```

Fix any `ERROR` lines before continuing. `WARN` lines are okay (they mean
your review will be degraded but it will still run).

## Step 7: run your review (under a second)

```
python3 run_review.py ~/my-reviews/AAA-FUND-A/Draft-1
```

You get a one-line summary. Now open the dashboard in your browser. On Mac:

```
open ~/my-reviews/AAA-FUND-A/Draft-1/_outputs/dashboard.html
```

On Windows, double-click the file in File Explorer.

## Step 8: disposition findings, export the PDFs

In the dashboard:

- Click **Accept** on findings you agree with that need to be fixed in the
  next draft.
- Click **Resolve** on findings you have already fixed.
- Click **Discard** on false positives (with a one-line reason if the engine
  asks you to attest).
- Ctrl+Z (Cmd+Z on Mac) undoes the last action.

The PDFs are already written in `_outputs/`:

- `preparer_export.pdf` — open + accepted findings, simplified. Email this
  to the fund administrator.
- `audit_file_export.pdf` — accepted + resolved findings with full audit
  trail. Save this for Deloitte.

You can re-run step 7 any time the figures or notes change; the engine
regenerates everything in under a second.

---

## Optional: switch on live Claude (15 extra minutes)

When the rule engine is comfortable and you want a second opinion that adds
judgment findings beyond the deterministic checklist:

1. **Get an Anthropic API key.** Sign up at **console.anthropic.com**,
   create a key, copy it.
2. **Install the Anthropic Python package.** In Terminal / Command Prompt:
   ```
   pip install anthropic
   ```
3. **Set the API key as an environment variable.** On Mac/Linux:
   ```
   export ANTHROPIC_API_KEY=sk-ant-...
   ```
   On Windows (Command Prompt):
   ```
   set ANTHROPIC_API_KEY=sk-ant-...
   ```
   (To make this persistent, add it to your shell config or System
   Properties → Environment Variables.)
4. **Edit `shine-v9/config/default.json`**: change `"adapter": "rule_based"`
   to `"adapter": "claude"`. Keep the model_pin field as-is.
5. Run step 7 again. Same command, same dashboard, but now the model has
   added any judgment findings the rules missed. Findings citing fake
   authority are silently rejected (you can see them in
   `_outputs/rejected_findings.json` if curious).

To switch back to rule-based mode, edit the config back. The two modes never
interact silently.

---

## Common gotchas

| Symptom | Fix |
|---|---|
| `error: framework: fund metadata does not declare presentation.framework` | Set `presentation.framework` to `ASC946`, `IFRS`, or `USGAAP` in `_FUND-METADATA.json`. |
| `error: halt-required input missing: figures.json` | The figures file is missing or in the wrong place. It must be at `<review-folder>/inputs/figures.json`. |
| `pre-flight failed: ... unparseable` | You have a JSON syntax error. Paste the file into jsonlint.com to find the typo. |
| Lots of TIE_OUT findings | The numbers in your `tie_out` section disagree with the rest of `figures.json`. This is the engine catching real inconsistencies. If you copy-pasted from a workbook that disagrees with the FS, that IS the finding. |
| Dashboard does not open | On Windows, right-click → Open with → your browser. On Mac, `open _outputs/dashboard.html` from Terminal. |

## Where to get help

- For SHINE itself: read `ARCHITECTURE.md` (how it works), `OPERATIONS.md`
  (everything in this quickstart in more depth), `SCALING.md` (when you
  want to grow this across funds).
- For the JSON formats: `templates/` has commented templates;
  `golden/clean_asc946/inputs/` has a fully populated reference.
- For Anthropic API issues: docs.anthropic.com.

Your first review is the slowest. By your third, you will be doing the
whole loop in 5 minutes per fund.
