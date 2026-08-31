"""Shift-tracking email alerts + the periodic scan used by the scheduler.

Recipients are always the admin (ADMIN_EMAIL env) plus the client's email.
Emails are sent via the existing Resend helper, which no-ops without a key.
"""
import os
import logging
from datetime import datetime, timezone, timedelta

from bson import ObjectId

from utils.email import send_email_with_attachment
from utils.shift_time import shift_bounds_utc
from utils.tz import to_local, DEFAULT_TZ

logger = logging.getLogger(__name__)

CHECKIN_INTERVAL_SECONDS = 3600      # hourly check-in
GRACE_SECONDS = 15 * 60              # 15 minute grace
CLOCKOUT_GRACE_SECONDS = 15 * 60     # 15 minutes past end time
MISSED_CLOCKIN_SECONDS = 10 * 60     # alert if not clocked in 10 min after start


def _fmt(dt: datetime) -> str:
    if not isinstance(dt, datetime):
        return "—"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return to_local(dt, DEFAULT_TZ).strftime("%d %b %Y, %I:%M %p")


async def _enrich(db, sched: dict) -> dict:
    async def one(coll, _id):
        if not _id:
            return {}
        try:
            return await db[coll].find_one({"_id": ObjectId(_id)}) or {}
        except Exception:
            return {}
    officer = await one("dispatch_officers", sched.get("officer_id"))
    post = await one("dispatch_post_sites", sched.get("post_site_id"))
    client = await one("dispatch_clients", sched.get("client_id"))
    return {"officer": officer, "post": post, "client": client}


async def resolve_recipients(db, sched: dict) -> list:
    ctx = await _enrich(db, sched)
    admin_email = os.environ.get("ADMIN_EMAIL")
    client_email = (ctx["client"] or {}).get("email")
    seen, out = set(), []
    for e in (admin_email, client_email):
        if e and e not in seen:
            seen.add(e)
            out.append(e)
    return out, ctx


def _shift_line(sched: dict, ctx: dict) -> str:
    officer = ctx["officer"] or {}
    post = ctx["post"] or {}
    return (
        f"<b>Officer:</b> {officer.get('name', '—')} ({officer.get('officer_code', '—')})<br>"
        f"<b>Post:</b> {post.get('name', '—')} · Pin {post.get('post_pin', '—')}<br>"
        f"<b>Location:</b> {post.get('location', sched.get('location', '—'))}<br>"
        f"<b>Shift:</b> {sched.get('date', '—')} · {sched.get('shift_type', '')} "
        f"{sched.get('start_time', '')}–{sched.get('end_time', '')}"
    )


async def _send_all(recipients: list, subject: str, html: str):
    for to in recipients:
        try:
            await send_email_with_attachment(to=to, subject=subject, html=html)
        except Exception as e:  # noqa: BLE001
            logger.error("Shift alert email failed to %s: %s", to, e)


async def send_missed_checkin(db, sched: dict, due: datetime):
    recipients, ctx = await resolve_recipients(db, sched)
    officer = (ctx["officer"] or {}).get("name", "The officer")
    subject = f"⚠️ Missed hourly check-in — {officer}"
    html = (
        f"<h2>Missed Check-In Alert</h2>"
        f"<p>{officer} has not completed the required hourly check-in "
        f"(due by {_fmt(due + timedelta(seconds=GRACE_SECONDS))}).</p>"
        f"<p>{_shift_line(sched, ctx)}</p>"
        f"<p>Time of alert: {_fmt(datetime.now(timezone.utc))}</p>"
    )
    await _send_all(recipients, subject, html)
    logger.info("Missed check-in alert sent for schedule %s to %s", sched.get("_id"), recipients)


async def send_missed_clockout(db, sched: dict, end_utc: datetime):
    recipients, ctx = await resolve_recipients(db, sched)
    officer = (ctx["officer"] or {}).get("name", "The officer")
    subject = f"⚠️ Missed clock-out — {officer}"
    html = (
        f"<h2>Missed Clock-Out Alert</h2>"
        f"<p>{officer} has not clocked out. The shift ended at {_fmt(end_utc)} "
        f"(15+ minutes ago). Please review and resolve manually.</p>"
        f"<p>{_shift_line(sched, ctx)}</p>"
        f"<p>Time of alert: {_fmt(datetime.now(timezone.utc))}</p>"
    )
    await _send_all(recipients, subject, html)
    logger.info("Missed clock-out alert sent for schedule %s to %s", sched.get("_id"), recipients)


async def send_missed_clockin(db, sched: dict, start_utc: datetime):
    recipients, ctx = await resolve_recipients(db, sched)
    officer = (ctx["officer"] or {}).get("name", "The officer")
    subject = f"⚠️ Missed clock-in — {officer}"
    html = (
        f"<h2>Missed Clock-In Alert</h2>"
        f"<p>{officer} has not clocked in for their shift. The shift started at "
        f"{_fmt(start_utc)} and the 10-minute grace period has now passed.</p>"
        f"<p>{_shift_line(sched, ctx)}</p>"
        f"<p>Time of alert: {_fmt(datetime.now(timezone.utc))}</p>"
    )
    await _send_all(recipients, subject, html)
    logger.info("Missed clock-in alert sent for schedule %s to %s", sched.get("_id"), recipients)


async def send_geofence_exit(db, sched: dict, at: datetime, lat, lng):
    recipients, ctx = await resolve_recipients(db, sched)
    officer = (ctx["officer"] or {}).get("name", "The officer")
    subject = f"🚨 Officer left the geofence — {officer}"
    html = (
        f"<h2>Geofence Exit Alert</h2>"
        f"<p>{officer} has left the assigned geofence zone during an active shift.</p>"
        f"<p>{_shift_line(sched, ctx)}</p>"
        f"<p><b>Left at:</b> {_fmt(at)}<br>"
        f"<b>Reported position:</b> {lat}, {lng}</p>"
    )
    await _send_all(recipients, subject, html)
    logger.info("Geofence exit alert sent for schedule %s to %s", sched.get("_id"), recipients)


async def _scan_one(db, s: dict, now: datetime):
    alerts = s.get("tracking_alerts") or {}
    windows = list(alerts.get("missed_checkin_windows") or [])

    # ---- Missed hourly check-in ----
    due = s.get("next_check_in_due_at")
    if isinstance(due, datetime):
        if due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
        if now > due + timedelta(seconds=GRACE_SECONDS):
            key = due.isoformat()
            if key not in windows:
                await send_missed_checkin(db, s, due)
                windows.append(key)
            new_due = due + timedelta(seconds=CHECKIN_INTERVAL_SECONDS)
            await db.dispatch_schedules.update_one(
                {"_id": s["_id"]},
                {"$set": {"next_check_in_due_at": new_due,
                          "tracking_alerts.missed_checkin_windows": windows}},
            )

    # ---- Missed clock-out ----
    if not alerts.get("missed_clockout_sent"):
        _, end_utc = shift_bounds_utc(s.get("date"), s.get("start_time"), s.get("end_time"))
        if end_utc and now > end_utc + timedelta(seconds=CLOCKOUT_GRACE_SECONDS):
            await send_missed_clockout(db, s, end_utc)
            await db.dispatch_schedules.update_one(
                {"_id": s["_id"]},
                {"$set": {"tracking_alerts.missed_clockout_sent": True}},
            )


async def _scan_missed_clockin(db, s: dict, now: datetime):
    if s.get("clock_in_at"):
        return
    alerts = s.get("tracking_alerts") or {}
    if alerts.get("missed_clockin_sent"):
        return
    start_utc, _ = shift_bounds_utc(s.get("date"), s.get("start_time"), s.get("end_time"))
    if not start_utc:
        return
    # Fire once, from 10 min after start until 24 h later (avoid alerting ancient shifts).
    if start_utc + timedelta(seconds=MISSED_CLOCKIN_SECONDS) < now <= start_utc + timedelta(hours=24):
        await send_missed_clockin(db, s, start_utc)
        await db.dispatch_schedules.update_one(
            {"_id": s["_id"]},
            {"$set": {"tracking_alerts.missed_clockin_sent": True}},
        )


async def run_shift_alert_scan(db):
    """Scan active (clocked-in, not clocked-out) shifts for missed check-ins
    and missed clock-outs, plus not-yet-started shifts for missed clock-ins.
    Safe to run every minute."""
    now = datetime.now(timezone.utc)
    try:
        cursor = db.dispatch_schedules.find({
            "shift_status": "Clocked In",
            "clock_out_at": None,
            "cancelled_at": None,
        })
        async for s in cursor:
            try:
                await _scan_one(db, s, now)
            except Exception as e:  # noqa: BLE001
                logger.error("Shift scan failed for %s: %s", s.get("_id"), e)
    except Exception as e:  # noqa: BLE001
        logger.error("Shift alert scan error: %s", e)

    # ---- Missed clock-in (officer never clocked in) ----
    try:
        cursor2 = db.dispatch_schedules.find({
            "clock_in_at": None,
            "cancelled_at": None,
            "shift_status": {"$nin": ["Clocked Out", "Cancelled"]},
        })
        async for s in cursor2:
            try:
                await _scan_missed_clockin(db, s, now)
            except Exception as e:  # noqa: BLE001
                logger.error("Missed clock-in scan failed for %s: %s", s.get("_id"), e)
    except Exception as e:  # noqa: BLE001
        logger.error("Missed clock-in scan error: %s", e)
