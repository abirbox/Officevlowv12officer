"""Editable email templates (subject / from-name / HTML body) with shortcodes.

Templates live in the `app_settings` collection under key `email_templates`.
Admins edit them in Settings; alerts render them with per-event values and fall
back to the built-in defaults when a field is blank."""

TEMPLATES_KEY = "email_templates"

# Shortcodes an admin can drop into any template field.
SHORTCODES = [
    "officer_name", "officer_code", "post_name", "post_pin", "location",
    "client_name", "shift_date", "shift_type", "start_time", "end_time",
    "timestamp", "shift_details",
]

DEFAULT_TEMPLATES = {
    "geofence_exit": {
        "label": "Geofence Exit Alert",
        "from_name": "OfficeFlow Alerts",
        "subject": "🚨 Officer left the geofence — {{officer_name}}",
        "body_html": "<h2>Geofence Exit Alert</h2><p>{{officer_name}} has left the assigned geofence zone during an active shift.</p>{{shift_details}}<p><b>Time of alert:</b> {{timestamp}}</p>",
    },
    "officer_offline": {
        "label": "Officer Offline Alert",
        "from_name": "OfficeFlow Alerts",
        "subject": "🔴 Officer offline — {{officer_name}}",
        "body_html": "<h2>Officer Offline Alert</h2><p>{{officer_name}}'s device has stopped sending location updates during an active shift.</p>{{shift_details}}<p><b>Time of alert:</b> {{timestamp}}</p>",
    },
    "missed_checkin": {
        "label": "Missed Hourly Check-In",
        "from_name": "OfficeFlow Alerts",
        "subject": "⚠️ Missed hourly check-in — {{officer_name}}",
        "body_html": "<h2>Missed Check-In Alert</h2><p>{{officer_name}} has not completed the required hourly check-in.</p>{{shift_details}}<p><b>Time of alert:</b> {{timestamp}}</p>",
    },
    "missed_clockin": {
        "label": "Missed Clock-In",
        "from_name": "OfficeFlow Alerts",
        "subject": "⚠️ Missed clock-in — {{officer_name}}",
        "body_html": "<h2>Missed Clock-In Alert</h2><p>{{officer_name}} has not clocked in for their shift and the grace period has passed.</p>{{shift_details}}<p><b>Time of alert:</b> {{timestamp}}</p>",
    },
    "missed_clockout": {
        "label": "Missed Clock-Out",
        "from_name": "OfficeFlow Alerts",
        "subject": "⚠️ Missed clock-out — {{officer_name}}",
        "body_html": "<h2>Missed Clock-Out Alert</h2><p>{{officer_name}} has not clocked out after their shift ended. Please review.</p>{{shift_details}}<p><b>Time of alert:</b> {{timestamp}}</p>",
    },
    "test": {
        "label": "Test Email",
        "from_name": "OfficeFlow",
        "subject": "✅ OfficeFlow test email",
        "body_html": "<h2>Email is working 🎉</h2><p>This is a test email from OfficeFlow, sent to confirm your email delivery is configured correctly.</p>{{shift_details}}<p><b>Sent at:</b> {{timestamp}}</p>",
    },
}


def render(text: str, values: dict) -> str:
    out = text or ""
    for k, v in (values or {}).items():
        out = out.replace("{{" + k + "}}", "" if v is None else str(v))
    return out


async def get_templates(db) -> dict:
    doc = await db.app_settings.find_one({"key": TEMPLATES_KEY}) or {}
    saved = doc.get("templates", {}) or {}
    merged = {}
    for key, default in DEFAULT_TEMPLATES.items():
        s = saved.get(key) or {}
        merged[key] = {
            "label": default["label"],
            "from_name": s.get("from_name") if s.get("from_name") is not None else default["from_name"],
            "subject": s.get("subject") if s.get("subject") is not None else default["subject"],
            "body_html": s.get("body_html") if s.get("body_html") is not None else default["body_html"],
        }
    return merged


async def save_template(db, key: str, from_name: str, subject: str, body_html: str):
    await db.app_settings.update_one(
        {"key": TEMPLATES_KEY},
        {"$set": {
            f"templates.{key}.from_name": from_name,
            f"templates.{key}.subject": subject,
            f"templates.{key}.body_html": body_html,
        }},
        upsert=True,
    )


async def render_template(db, key: str, values: dict) -> dict:
    tpls = await get_templates(db)
    t = tpls.get(key) or DEFAULT_TEMPLATES.get(key, {})
    return {
        "from_name": render(t.get("from_name", ""), values) or None,
        "subject": render(t.get("subject", ""), values),
        "html": render(t.get("body_html", ""), values),
    }
