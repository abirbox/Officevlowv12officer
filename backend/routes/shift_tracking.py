"""Public, token-based shift-tracking endpoints for Security Officers.

These routes are intentionally UNAUTHENTICATED — access is guarded by an
unguessable per-shift token. Reachable at /api/shift-track/{token}.
"""
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from typing import Optional

from utils.geo import geofence_check
from utils.shift_time import shift_bounds_utc
from utils.shift_alerts import (
    CHECKIN_INTERVAL_SECONDS, GRACE_SECONDS, CLOCKOUT_GRACE_SECONDS,
    send_geofence_exit,
)

router = APIRouter(prefix="/shift-track", tags=["shift-tracking"])

CLOCKIN_WINDOW_SECONDS = 10 * 60         # clock-in opens 10 min before start
CLOCKOUT_WINDOW_SECONDS = 0              # clock-out opens exactly at shift end
LINK_EXPIRY_SECONDS = 24 * 3600          # link dies 1 day after shift end
GEOFENCE_EMAIL_THROTTLE_SECONDS = 5 * 60


def get_db(request: Request):
    return request.app.state.db


def _now():
    return datetime.now(timezone.utc)


class GeoPing(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class EmergencyOut(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    remark: str


def _iso(dt):
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    return dt


async def _load(db, token: str) -> dict:
    sched = await db.dispatch_schedules.find_one({"tracking_token": token})
    if not sched:
        raise HTTPException(404, "Shift link not found")
    return sched


async def _build_payload(db, sched: dict) -> dict:
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

    start_utc, end_utc = shift_bounds_utc(
        sched.get("date"), sched.get("start_time"), sched.get("end_time"))
    clockin_opens = start_utc - timedelta(seconds=CLOCKIN_WINDOW_SECONDS) if start_utc else None
    clockout_opens = end_utc - timedelta(seconds=CLOCKOUT_WINDOW_SECONDS) if end_utc else None

    return {
        "token": sched.get("tracking_token"),
        "expired": False,
        "officer": {
            "name": officer.get("name"),
            "code": officer.get("officer_code"),
            "ssn": officer.get("social_security_code"),
        },
        "client_name": client.get("name"),
        "location": post.get("location") or sched.get("location"),
        "post_pin": post.get("post_pin"),
        "post_name": post.get("name"),
        "city": post.get("city"),
        "shift_type": sched.get("shift_type"),
        "date": sched.get("date"),
        "start_time": sched.get("start_time"),
        "end_time": sched.get("end_time"),
        "duty_hours": sched.get("duty_hours"),
        "duty_rate": sched.get("duty_rate"),
        "site_instruction": sched.get("site_instruction"),
        "shift_status": sched.get("shift_status"),
        "geofence": {
            "latitude": post.get("latitude"),
            "longitude": post.get("longitude"),
            "radius_m": post.get("geofence_radius_m") or 150,
            "configured": post.get("latitude") is not None and post.get("longitude") is not None,
        },
        "tracking": {
            "clock_in_at": _iso(sched.get("clock_in_at")),
            "clock_out_at": _iso(sched.get("clock_out_at")),
            "last_check_in_at": _iso(sched.get("last_check_in_at")),
            "next_check_in_due_at": _iso(sched.get("next_check_in_due_at")),
            "check_in_count": len(sched.get("check_ins") or []),
            "emergency_clock_out": sched.get("emergency_clock_out"),
            "cancelled_at": _iso(sched.get("cancelled_at")),
            "checkin_interval_minutes": CHECKIN_INTERVAL_SECONDS // 60,
            "checkin_grace_minutes": GRACE_SECONDS // 60,
        },
        "windows": {
            "shift_start_at": _iso(start_utc),
            "shift_end_at": _iso(end_utc),
            "clock_in_opens_at": _iso(clockin_opens),
            "clock_out_opens_at": _iso(clockout_opens),
            "server_now": _iso(_now()),
        },
    }


def _require_geofence(post: dict, ping: GeoPing, action: str):
    within, dist, configured = geofence_check(post, ping.latitude, ping.longitude)
    if configured and not within:
        radius = post.get("geofence_radius_m") or 150
        if dist is None:
            msg = f"Location required to {action}. Please enable location access."
        else:
            msg = (f"You appear to be {int(dist)} m away. You must be within "
                   f"{int(radius)} m of the post to {action}.")
        raise HTTPException(403, msg)


async def _post(db, sched):
    try:
        return await db.dispatch_post_sites.find_one({"_id": ObjectId(sched.get("post_site_id"))}) or {}
    except Exception:
        return {}


async def _officer_name(db, officer_id):
    """Safely resolve an officer's name. Schedule officer_id may be a special
    sentinel ('TEMP'/'OPEN_SHIFT') that is not a valid ObjectId."""
    if not officer_id:
        return None
    try:
        doc = await db.dispatch_officers.find_one({"_id": ObjectId(officer_id)})
    except Exception:
        return None
    return (doc or {}).get("name")


async def _action_history(db, sched, action, remarks=None):
    await db.dispatch_action_history.insert_one({
        "schedule_id": str(sched["_id"]),
        "action": action,
        "old_value": sched.get("shift_status"),
        "new_value": action,
        "remarks": remarks,
        "actor_id": None,
        "actor_name": await _officer_name(db, sched.get("officer_id")),
        "actor_role": "officer",
        "at": _now(),
    })


@router.get("/{token}")
async def get_shift(token: str, db=Depends(get_db)):
    sched = await _load(db, token)
    _, end_utc = shift_bounds_utc(sched.get("date"), sched.get("start_time"), sched.get("end_time"))
    if end_utc and _now() > end_utc + timedelta(seconds=LINK_EXPIRY_SECONDS):
        return {"token": token, "expired": True,
                "message": "This shift link has expired."}
    return await _build_payload(db, sched)


@router.post("/{token}/clock-in")
async def clock_in(token: str, ping: GeoPing, db=Depends(get_db)):
    sched = await _load(db, token)
    if sched.get("cancelled_at") or sched.get("shift_status") == "Cancelled":
        raise HTTPException(400, "This shift has been cancelled.")
    if sched.get("clock_in_at"):
        raise HTTPException(400, "You have already clocked in.")
    start_utc, _ = shift_bounds_utc(sched.get("date"), sched.get("start_time"), sched.get("end_time"))
    if start_utc:
        opens = start_utc - timedelta(seconds=CLOCKIN_WINDOW_SECONDS)
        if _now() < opens:
            raise HTTPException(400, "Clock In opens 10 minutes before the shift start time.")
    post = await _post(db, sched)
    _require_geofence(post, ping, "Clock In")
    now = _now()
    await db.dispatch_schedules.update_one({"_id": sched["_id"]}, {"$set": {
        "clock_in_at": now,
        "shift_status": "Clocked In",
        "actual_check_in": now.isoformat(),
        "next_check_in_due_at": now + timedelta(seconds=CHECKIN_INTERVAL_SECONDS),
        "last_check_in_at": now,
        "clock_in_location": {"lat": ping.latitude, "lng": ping.longitude},
        "tracking_alerts": {"missed_checkin_windows": [], "missed_clockout_sent": False},
        "updated_at": now,
    }})
    await _action_history(db, sched, "Clocked In")
    return await _build_payload(db, await _load(db, token))


@router.post("/{token}/check-in")
async def check_in(token: str, ping: GeoPing, db=Depends(get_db)):
    sched = await _load(db, token)
    if sched.get("shift_status") != "Clocked In" or not sched.get("clock_in_at"):
        raise HTTPException(400, "You must be clocked in to check in.")
    post = await _post(db, sched)
    _require_geofence(post, ping, "Check In")
    now = _now()
    entry = {"at": now, "lat": ping.latitude, "lng": ping.longitude}
    await db.dispatch_schedules.update_one({"_id": sched["_id"]}, {
        "$push": {"check_ins": entry},
        "$set": {
            "last_check_in_at": now,
            "next_check_in_due_at": now + timedelta(seconds=CHECKIN_INTERVAL_SECONDS),
            "updated_at": now,
        },
    })
    await _action_history(db, sched, "Check-In")
    return await _build_payload(db, await _load(db, token))


@router.post("/{token}/clock-out")
async def clock_out(token: str, ping: GeoPing, db=Depends(get_db)):
    sched = await _load(db, token)
    if sched.get("shift_status") != "Clocked In" or not sched.get("clock_in_at"):
        raise HTTPException(400, "You must be clocked in to clock out.")
    _, end_utc = shift_bounds_utc(sched.get("date"), sched.get("start_time"), sched.get("end_time"))
    if end_utc:
        opens = end_utc - timedelta(seconds=CLOCKOUT_WINDOW_SECONDS)
        if _now() < opens:
            raise HTTPException(400, "Clock Out opens at the shift end time.")
    post = await _post(db, sched)
    _require_geofence(post, ping, "Clock Out")
    now = _now()
    await db.dispatch_schedules.update_one({"_id": sched["_id"]}, {"$set": {
        "clock_out_at": now,
        "shift_status": "Clocked Out",
        "actual_check_out": now.isoformat(),
        "clock_out_location": {"lat": ping.latitude, "lng": ping.longitude},
        "updated_at": now,
    }})
    await _action_history(db, sched, "Clocked Out")
    return await _build_payload(db, await _load(db, token))


@router.post("/{token}/emergency-clock-out")
async def emergency_clock_out(token: str, payload: EmergencyOut, db=Depends(get_db)):
    sched = await _load(db, token)
    if sched.get("shift_status") != "Clocked In" or not sched.get("clock_in_at"):
        raise HTTPException(400, "You must be clocked in to use emergency clock out.")
    if not (payload.remark or "").strip():
        raise HTTPException(400, "Please enter a reason for the emergency clock out.")
    now = _now()
    emergency = {
        "at": now.isoformat(),
        "remark": payload.remark.strip(),
        "lat": payload.latitude,
        "lng": payload.longitude,
    }
    await db.dispatch_schedules.update_one({"_id": sched["_id"]}, {"$set": {
        "clock_out_at": now,
        "shift_status": "Clocked Out",
        "actual_check_out": now.isoformat(),
        "emergency_clock_out": emergency,
        "updated_at": now,
    }})
    await _action_history(db, sched, "Emergency Clock Out", remarks=payload.remark.strip())
    return await _build_payload(db, await _load(db, token))


@router.post("/{token}/cancel")
async def cancel_shift(token: str, db=Depends(get_db)):
    sched = await _load(db, token)
    now = _now()
    await db.dispatch_schedules.update_one({"_id": sched["_id"]}, {"$set": {
        "shift_status": "Cancelled",
        "cancelled_at": now,
        "updated_at": now,
    }})
    await _action_history(db, sched, "Cancelled")
    return await _build_payload(db, await _load(db, token))


@router.post("/{token}/geofence-exit")
async def geofence_exit(token: str, ping: GeoPing, db=Depends(get_db)):
    sched = await _load(db, token)
    if sched.get("shift_status") != "Clocked In":
        return {"ok": True, "emailed": False}
    now = _now()
    entry = {"at": now, "lat": ping.latitude, "lng": ping.longitude}
    await db.dispatch_schedules.update_one({"_id": sched["_id"]},
                                           {"$push": {"geofence_exits": entry}})
    last = sched.get("geofence_exit_emailed_at")
    emailed = False
    if not isinstance(last, datetime) or (now - (last.replace(tzinfo=timezone.utc) if last.tzinfo is None else last)).total_seconds() > GEOFENCE_EMAIL_THROTTLE_SECONDS:
        await send_geofence_exit(db, sched, now, ping.latitude, ping.longitude)
        await db.dispatch_schedules.update_one({"_id": sched["_id"]},
                                               {"$set": {"geofence_exit_emailed_at": now}})
        emailed = True
    return {"ok": True, "emailed": emailed}
