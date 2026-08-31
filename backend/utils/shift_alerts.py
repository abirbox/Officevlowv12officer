"""Shift-tracking email alerts + the periodic scan used by the scheduler.

Recipients are always the admin (ADMIN_EMAIL env) plus the client's email.
Emails are sent via the existing Resend helper, which no-ops without a key.
"""
import os
import logging
from datetime import datetime, timezone, timedelta

from bson import ObjectId

from utils.email import send_email_with_attachment
from utils.mailer import send_email
from utils.email_templates import render_template
from utils.shift_time import shift_bounds_utc
from utils.tz import to_local, DEFAULT_TZ

logger = logging.getLogger(__name__)

CHECKIN_INTERVAL_SECONDS = 3600      # hourly check-in
GRACE_SECONDS = 15 * 60              # 15 minute grace
CLOCKOUT_GRACE_SECONDS = 15 * 60     # 15 minutes past end time
MISSED_CLOCKIN_SECONDS = 10 * 60     # alert if not clocked in 10 min after start
OFFLINE_THRESHOLD_SECONDS = 180      # no heartbeat/ping for 3 min => offline


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
    # Admin recipients come from Settings (comma-separated), falling back to the
    # ADMIN_EMAIL env var when not configured.
    smtp = await db.app_settings.find_one({"key": "smtp_settings"}) or {}
    admins = [e.strip() for e in (smtp.get("admin_alert_emails") or "").split(",") if e.strip()]
    if not admins:
        env = os.environ.get("ADMIN_EMAIL")
        if env:
            admins = [env]
    client_email = (ctx["client"] or {}).get("email")
    seen, out = set(), []
    for e in (*admins, client_email):
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


def _alert_values(sched: dict, ctx: dict, extra: dict | None = None) -> dict:
    officer = ctx.get("officer") or {}
    post = ctx.get("post") or {}
    client = ctx.get("client") or {}
    values = {
        "officer_name": officer.get("name", "The officer"),
        "officer_code": officer.get("officer_code", "—"),
        "post_name": post.get("name", "—"),
        "post_pin": post.get("post_pin", "—"),
        "location": post.get("location", sched.get("location", "—")),
        "client_name": client.get("name", "—"),
        "shift_date": sched.get("date", "—"),
        "shift_type": sched.get("shift_type", ""),
        "start_time": sched.get("start_time", ""),
        "end_time": sched.get("end_time", ""),
        "timestamp": _fmt(datetime.now(timezone.utc)),
        "shift_details": _shift_line(sched, ctx),
    }
    if extra:
        values.update(extra)
    return values


async def _dispatch_alert(db, sched, key, extra=None, fallback_subject="", fallback_html=""):
    """Render the admin-editable template for this alert type (falling back to
    the built-in text) and send it to all recipients via the unified mailer."""
    recipients, ctx = await resolve_recipients(db, sched)
    values = _alert_values(sched, ctx, extra)
    r = await render_template(db, key, values)
    subject = r.get("subject") or fallback_subject
    html = r.get("html") or fallback_html
    from_name = r.get("from_name")
    for to in recipients:
        try:
            await send_email(db, to=to, subject=subject, html=html, from_name=from_name)
        except Exception as e:  # noqa: BLE001
            logger.error("Shift alert email failed to %s: %s", to, e)
    logger.info("Alert '%s' sent for schedule %s to %s", key, sched.get("_id"), recipients)
    return recipients


async def send_missed_checkin(db, sched: dict, due: datetime):
    await _dispatch_alert(db, sched, "missed_checkin")


async def send_missed_clockout(db, sched: dict, end_utc: datetime):
    await _dispatch_alert(db, sched, "missed_clockout")


async def send_missed_clockin(db, sched: dict, start_utc: datetime):
    await _dispatch_alert(db, sched, "missed_clockin")


async def send_geofence_exit(db, sched: dict, at: datetime, lat, lng):
    await _dispatch_alert(db, sched, "geofence_exit",
                          extra={"position": f"{lat}, {lng}"})


async def send_officer_offline(db, sched: dict, last_seen: datetime):
    await _dispatch_alert(db, sched, "officer_offline",
                          extra={"last_seen": _fmt(last_seen)})


async def _scan_one(db, s: dict, now: datetime):
    alerts = s.get("tracking_alerts") or {}
    windows = list(alerts.get("missed_checkin_windows") or [])

    # ---- Officer offline (no heartbeat within threshold) ----
    if not alerts.get("offline_sent"):
        last_seen = s.get("last_seen_at")
        if isinstance(last_seen, datetime):
            ls = last_seen if last_seen.tzinfo else last_seen.replace(tzinfo=timezone.utc)
            if (now - ls).total_seconds() > OFFLINE_THRESHOLD_SECONDS:
                await send_officer_offline(db, s, ls)
                await db.dispatch_schedules.update_one(
                    {"_id": s["_id"]}, {"$set": {"tracking_alerts.offline_sent": True}})
                try:
                    from routes.dispatch import notify_dispatch_users, broadcast_live_update
                    name = (await _enrich(db, s))["officer"].get("name", "An officer")
                    await notify_dispatch_users(
                        db, s.get("client_id"),
                        title=f"🔴 Officer offline — {name}",
                        message=f"{name} stopped sending location ({s.get('date')} {s.get('start_time')}–{s.get('end_time')}).",
                        event={"type": "dispatch_officer_offline", "schedule_id": str(s["_id"])},
                    )
                    await broadcast_live_update(db, await db.dispatch_schedules.find_one({"_id": s["_id"]}))
                except Exception as e:  # noqa: BLE001
                    logger.warning("offline notify/broadcast failed: %s", e)

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
