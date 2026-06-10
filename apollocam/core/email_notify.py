"""
Email notification system for ApolloCAM.

Background EmailWorker daemon thread drains a queue so Streamlit UI never blocks.
Supports smtplib/SSL (cross-platform) with Windows Outlook COM fallback when
SMTP_HOST is not configured.

Alert types:
  alert_red        — triggered on import when a fund is RED
  digest           — daily summary to full distribution list
  wire_pending     — approved wires not submitted by EOD
  fx_stale         — FX rates older than threshold
  predictive_red   — fund projected RED within 3 days
"""

import hashlib
import logging
import queue
import smtplib
import ssl
import threading
from datetime import date, datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from core.database import log_audit

logger = logging.getLogger(__name__)

_email_queue: queue.Queue = queue.Queue()
_worker_started = False
_worker_lock = threading.Lock()

# ─────────────────────────────────────────────────────────────────────────────
# Worker thread
# ─────────────────────────────────────────────────────────────────────────────

class EmailWorker(threading.Thread):
    """Background daemon thread that drains the email queue."""

    daemon = True

    def run(self):
        while True:
            job = _email_queue.get()
            try:
                _dispatch(job)
                logger.info("Email sent: %s to %s", job["email_type"], job["recipients"])
            except Exception as exc:
                logger.error("Email failed: %s — %s", job["email_type"], exc)
            finally:
                _email_queue.task_done()


def _ensure_worker():
    global _worker_started
    with _worker_lock:
        if not _worker_started:
            EmailWorker().start()
            _worker_started = True


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def enqueue_email(
    email_type: str,
    recipients: list[str],
    subject: str,
    html_body: str,
    conn=None,
    business_date: str | None = None,
    sent_by: str = "system",
) -> None:
    """
    Non-blocking: puts the email job on the queue and returns immediately.
    Starts the daemon worker on first call.
    """
    _ensure_worker()
    body_hash = hashlib.sha256(html_body.encode()).hexdigest()[:16]
    # Resolve SMTP config here in the calling (main) thread — the worker must never
    # touch the shared Streamlit DB connection from a background thread.
    smtp_cfg = _smtp_config(conn)
    job = {
        "email_type": email_type,
        "recipients": recipients,
        "subject": subject,
        "html_body": html_body,
        "business_date": business_date or str(date.today()),
        "sent_by": sent_by,
        "body_hash": body_hash,
        "smtp_cfg": smtp_cfg,
    }
    _email_queue.put(job)


def send_red_alert(conn, fund_code: str, deficit: float, run_date: str, sent_by: str = "system"):
    """Send threshold alert for a RED fund. Respects AlreadyAlertedToday logic."""
    if _already_alerted_today(conn, fund_code):
        return

    from core.engine import _get_setting
    dl_email = _get_setting(conn, "DL_EMAIL", "")
    if not dl_email:
        return

    subject = f"ApolloCAM ALERT — {fund_code} is RED | {run_date}"
    html = _build_alert_html(fund_code, deficit, run_date)
    enqueue_email("alert_red", [dl_email], subject, html, conn=conn,
                  business_date=run_date, sent_by=sent_by)
    log_audit(conn, "ALERT_QUEUED", "fund", fund_code,
              f"RED alert queued | deficit ${deficit:,.0f}")


def send_daily_digest(conn, run_date: str, sent_by: str = "system"):
    """Queue the daily digest email if DIGEST_ENABLED=true."""
    from core.engine import _get_setting
    if _get_setting(conn, "DIGEST_ENABLED", "false").lower() != "true":
        return

    dl_email = _get_setting(conn, "DL_EMAIL", "")
    controller_email = _get_setting(conn, "CONTROLLER_EMAIL", "")
    if not dl_email:
        return

    recipients = [r for r in [dl_email, controller_email] if r]
    subject = f"ApolloCAM Daily Digest — {_fmt_date(run_date)}"
    html = _build_digest_html(conn, run_date)
    enqueue_email("digest", recipients, subject, html, conn=conn,
                  business_date=run_date, sent_by=sent_by)
    log_audit(conn, "DIGEST_QUEUED", "system", "all",
              f"Daily digest queued to {len(recipients)} recipients")


def send_wire_pending_alert(conn, run_date: str, pending_count: int, sent_by: str = "system"):
    """Alert operations when approved wires haven't been submitted by EOD."""
    from core.engine import _get_setting
    controller_email = _get_setting(conn, "CONTROLLER_EMAIL", "")
    if not controller_email:
        return

    subject = f"ApolloCAM — {pending_count} approved wire(s) pending submission | {run_date}"
    html = f"""
    <html><body style="font-family: Calibri, sans-serif;">
    <p style="color: #991B1B; font-weight: bold;">
        {pending_count} wire(s) approved but not yet submitted to IVP as of {_fmt_date(run_date)}.
    </p>
    <p>Please review the <strong>Loaders</strong> page and submit outstanding items.</p>
    </body></html>
    """
    enqueue_email("wire_pending", [controller_email], subject, html, conn=conn,
                  business_date=run_date, sent_by=sent_by)


def send_fx_stale_alert(conn, stale_currencies: list[str], sent_by: str = "system"):
    """Alert when FX rates are older than FX_STALE_DAYS threshold."""
    from core.engine import _get_setting
    controller_email = _get_setting(conn, "CONTROLLER_EMAIL", "")
    if not controller_email:
        return

    today = str(date.today())
    ccy_list = ", ".join(stale_currencies)
    subject = f"ApolloCAM — Stale FX rates: {ccy_list}"
    html = f"""
    <html><body style="font-family: Calibri, sans-serif;">
    <p style="color: #B45309; font-weight: bold;">Stale FX rates detected as of {today}:</p>
    <p>{ccy_list}</p>
    <p>Please update rates in <strong>Settings → FX Rates</strong>.</p>
    </body></html>
    """
    enqueue_email("fx_stale", [controller_email], subject, html,
                  business_date=today, sent_by=sent_by)


def send_predictive_red_alert(conn, at_risk_funds: list[dict], run_date: str, sent_by: str = "system"):
    """Alert when any fund is projected to go RED within 3 days."""
    from core.engine import _get_setting
    controller_email = _get_setting(conn, "CONTROLLER_EMAIL", "")
    if not controller_email or not at_risk_funds:
        return

    rows = "".join(
        f"<tr><td>{f['fund_code']}</td><td>{f['days_until_red']}</td>"
        f"<td style='color:#991B1B'>${f['projected_cash']:,.0f}</td></tr>"
        for f in at_risk_funds
    )
    subject = f"ApolloCAM — Predictive RED alert | {run_date}"
    html = f"""
    <html><body style="font-family: Calibri, sans-serif;">
    <p style="color: #991B1B; font-weight: bold;">Funds projected to go RED within 3 business days:</p>
    <table border="1" cellpadding="4" style="border-collapse:collapse;font-size:12px;">
      <tr style="background:#1E3A5F;color:white;">
        <th>Fund</th><th>Days Until RED</th><th>Projected Cash</th>
      </tr>
      {rows}
    </table>
    <p>Review the <strong>Forecast</strong> page for detail.</p>
    </body></html>
    """
    enqueue_email("predictive_red", [controller_email], subject, html, conn=conn,
                  business_date=run_date, sent_by=sent_by)


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _dispatch(job: dict):
    """Send via SMTP/SSL if configured, else fall back to Outlook COM."""
    cfg = job["smtp_cfg"]  # pre-resolved in main thread; no DB access here
    if cfg["host"]:
        _send_smtp(job, cfg)
    else:
        _send_outlook(job)


def _send_smtp(job: dict, cfg: dict):
    msg = _build_mime(job)
    ctx = ssl.create_default_context()
    port = int(cfg["port"] or 587)

    if port == 465:
        with smtplib.SMTP_SSL(cfg["host"], port, context=ctx) as server:
            if cfg["user"] and cfg["password"]:
                server.login(cfg["user"], cfg["password"])
            server.sendmail(cfg["user"] or "apollocam@apollo.com",
                            job["recipients"], msg.as_string())
    else:
        with smtplib.SMTP(cfg["host"], port) as server:
            server.ehlo()
            server.starttls(context=ctx)
            if cfg["user"] and cfg["password"]:
                server.login(cfg["user"], cfg["password"])
            server.sendmail(cfg["user"] or "apollocam@apollo.com",
                            job["recipients"], msg.as_string())


def _send_outlook(job: dict):
    """Windows Outlook COM fallback via late binding — no pywin32 import at module level."""
    try:
        import win32com.client  # type: ignore
    except ImportError:
        raise RuntimeError(
            "SMTP_HOST not configured and pywin32 is not installed. "
            "Set SMTP_HOST in Settings or install pywin32 on Windows."
        )
    ol = win32com.client.Dispatch("Outlook.Application")
    mail = ol.CreateItem(0)  # olMailItem
    mail.To = "; ".join(job["recipients"])
    mail.Subject = job["subject"]
    mail.HTMLBody = job["html_body"]
    mail.Send()


def _build_mime(job: dict) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = job["subject"]
    msg["To"] = ", ".join(job["recipients"])
    msg.attach(MIMEText(job["html_body"], "html"))
    return msg


def _smtp_config(conn) -> dict:
    """Read SMTP settings from DB (preferred) then fall back to environment variables."""
    import os
    from dotenv import load_dotenv
    load_dotenv()

    cfg = {
        "host": os.getenv("SMTP_HOST", ""),
        "port": os.getenv("SMTP_PORT", "587"),
        "user": os.getenv("SMTP_USER", ""),
        "password": os.getenv("SMTP_PASSWORD", ""),
    }

    if conn:
        try:
            from core.engine import _get_setting
            host = _get_setting(conn, "SMTP_HOST", "")
            if host:
                cfg["host"] = host
                cfg["port"] = _get_setting(conn, "SMTP_PORT", "587")
                cfg["user"] = _get_setting(conn, "SMTP_USER", "")
                cfg["password"] = _get_setting(conn, "SMTP_PASSWORD", "")
        except Exception:
            pass

    return cfg


def _already_alerted_today(conn, fund_code: str) -> bool:
    """Check audit_log for an alert_red sent for this fund today."""
    today = str(date.today())
    row = conn.execute(
        """SELECT 1 FROM audit_log
           WHERE action = 'ALERT_QUEUED'
             AND entity_id = ?
             AND date(timestamp) = ?
           LIMIT 1""",
        (fund_code, today),
    ).fetchone()
    return row is not None


def _fmt_date(run_date: str) -> str:
    """Format '2026-06-01' → '01-Jun-2026'."""
    try:
        return datetime.strptime(run_date, "%Y-%m-%d").strftime("%d-%b-%Y")
    except ValueError:
        return run_date


def _build_alert_html(fund_code: str, deficit: float, run_date: str) -> str:
    return f"""
    <html><body style="font-family: Calibri, sans-serif;">
    <div style="background:#FEE2E2; border-left:4px solid #991B1B; padding:12px; margin-bottom:12px;">
      <strong style="color:#991B1B; font-size:14px;">CASH ALERT — {fund_code}</strong>
    </div>
    <table style="font-size:12px; border-collapse:collapse;">
      <tr><td style="padding:4px 12px 4px 0; font-weight:bold;">Fund</td>
          <td style="color:#991B1B">{fund_code}</td></tr>
      <tr><td style="padding:4px 12px 4px 0; font-weight:bold;">Status</td>
          <td style="color:#991B1B">&#9632; RED</td></tr>
      <tr><td style="padding:4px 12px 4px 0; font-weight:bold;">Deficit</td>
          <td>${deficit:,.0f}</td></tr>
      <tr><td style="padding:4px 12px 4px 0; font-weight:bold;">As of</td>
          <td>{_fmt_date(run_date)}</td></tr>
    </table>
    <p style="margin-top:12px; font-size:11px; color:#6B7280;">
      Please log into ApolloCAM and review the Proposals page to approve wire transfers.
    </p>
    </body></html>
    """


def _build_digest_html(conn, run_date: str) -> str:
    """Generate HTML digest table from fund view data."""
    try:
        from core.engine import build_fund_view, get_amber_buffer, status_summary
        from core.engine import RED, AMBER, GREEN, BLUE

        amber_buffer = get_amber_buffer(conn)
        df = build_fund_view(conn, run_date, amber_buffer)
        summary = status_summary(df)

        rows = ""
        status_colours = {
            RED: ("#FEE2E2", "#991B1B"),
            AMBER: ("#FEF3C7", "#92400E"),
            GREEN: ("#DCFCE7", "#166534"),
            BLUE: ("#DBEAFE", "#1E40AF"),
        }
        order_map = {RED: 0, AMBER: 1, GREEN: 2, BLUE: 3}
        for _, r in df.sort_values("status", key=lambda s: s.map(order_map)).iterrows():
            bg, fg = status_colours.get(r["status"], ("", "#000"))
            rows += (
                f"<tr style='background:{bg}'>"
                f"<td>{r['fund_code']}</td>"
                f"<td>{r['fund_name']}</td>"
                f"<td style='text-align:right'>${r['cash_usd']:,.0f}</td>"
                f"<td style='text-align:right'>${r['cash_floor']:,.0f}</td>"
                f"<td style='color:{fg}; font-weight:bold; text-align:center'>{r['status']}</td>"
                f"<td style='text-align:right'>${r['surplus']:,.0f}</td>"
                f"</tr>"
            )

        kpis = (
            f"<span style='background:#FEE2E2;color:#991B1B;padding:2px 8px;border-radius:4px;margin-right:6px'>"
            f"RED {summary[RED]}</span>"
            f"<span style='background:#FEF3C7;color:#92400E;padding:2px 8px;border-radius:4px;margin-right:6px'>"
            f"AMBER {summary[AMBER]}</span>"
            f"<span style='background:#DCFCE7;color:#166534;padding:2px 8px;border-radius:4px;margin-right:6px'>"
            f"GREEN {summary[GREEN]}</span>"
            f"<span style='background:#DBEAFE;color:#1E40AF;padding:2px 8px;border-radius:4px'>"
            f"BLUE {summary[BLUE]}</span>"
        )

        return f"""
        <html><body style="font-family: Calibri, sans-serif; font-size:12px;">
        <div style="background:#0F2744;color:#D4AF37;padding:12px 16px;margin-bottom:16px;">
          <strong style="font-size:16px;">ApolloCAM Daily Digest — {_fmt_date(run_date)}</strong>
        </div>
        <p style="margin-bottom:8px;">{kpis}</p>
        <table border="1" cellpadding="4" style="border-collapse:collapse; width:100%; font-size:11px;">
          <tr style="background:#1E3A5F; color:white; font-weight:bold;">
            <th>Fund Code</th><th>Fund Name</th><th>Cash (USD)</th>
            <th>Floor</th><th>Status</th><th>Surplus/(Deficit)</th>
          </tr>
          {rows}
        </table>
        <p style="font-size:10px; color:#6B7280; margin-top:12px;">
          Generated by ApolloCAM · Apollo Global Management Mumbai · Fund Controllership
        </p>
        </body></html>
        """
    except Exception as exc:
        return f"<html><body><p>Digest generation error: {exc}</p></body></html>"
