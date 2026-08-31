from fastapi import APIRouter, HTTPException, Request, Depends, UploadFile
from datetime import datetime, timezone
import os

from models.settings import (
    AppSettings, AppSettingsUpdate, CURRENCY_DIRECTORY, TIMEZONE_DIRECTORY,
    EmailSettingsUpdate,
)
from utils.auth import get_current_user
from utils.storage import put_object, generate_upload_path, to_public_url
from utils.smtp import SMTP_KEY, encrypt_secret, get_smtp_doc
from utils.email_templates import (
    get_templates, save_template, render_template, SHORTCODES, DEFAULT_TEMPLATES,
)
from utils.mailer import send_email

router = APIRouter(prefix="/settings", tags=["App Settings"])

SETTINGS_KEY = "app_settings_singleton"


def get_db(request: Request):
    return request.app.state.db


async def require_admin(request: Request, db):
    user = await get_current_user(request, db)
    if user.get("role") not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def get_settings_doc(db) -> dict:
    doc = await db.app_settings.find_one({"key": SETTINGS_KEY}, {"_id": 0})
    if not doc:
        defaults = AppSettings().model_dump()
        doc = {"key": SETTINGS_KEY, **defaults, "created_at": datetime.now(timezone.utc)}
        await db.app_settings.insert_one(doc)
        doc.pop("_id", None)
    return doc


@router.get("/public")
async def get_public_settings(request: Request, db=Depends(get_db)):
    """Login page and other pre-auth screens read this."""
    doc = await get_settings_doc(db)
    return {
        "brand_name": doc.get("brand_name", "OfficeFlow"),
        "brand_logo_url": doc.get("brand_logo_url"),
        "favicon_url": doc.get("favicon_url"),
        "site_title": doc.get("site_title"),
        "footer_text": doc.get("footer_text"),
        "company_address": doc.get("company_address"),
        "support_email": doc.get("support_email"),
        "contact_phone": doc.get("contact_phone"),
        "login_hero_title": doc.get("login_hero_title", "OfficeFlow"),
        "login_hero_subtitle": doc.get("login_hero_subtitle", ""),
        "login_welcome_title": doc.get("login_welcome_title", "Welcome Back"),
        "login_welcome_subtitle": doc.get("login_welcome_subtitle", "Sign in to your account"),
        "currency": doc.get("currency", "BDT"),
        "currency_symbol": doc.get("currency_symbol", "৳"),
        "map_provider": doc.get("map_provider", "osm"),
        "google_maps_api_key": doc.get("google_maps_api_key"),
        "not_found_lottie_enabled": doc.get("not_found_lottie_enabled", True),
        "not_found_lottie_url": doc.get("not_found_lottie_url"),
        # Client portal login
        "client_login_badge": doc.get("client_login_badge", "Client Portal"),
        "client_login_title": doc.get("client_login_title", "Client Sign In"),
        "client_login_subtitle": doc.get("client_login_subtitle", "Sign in to view your schedules, invoices and reports"),
        "client_login_hero_title": doc.get("client_login_hero_title", "Client Portal"),
        "client_login_hero_subtitle": doc.get("client_login_hero_subtitle", "Live dispatch schedules, invoices, wage reports and post-site coverage — everything you need to keep your operation on track."),
        "client_login_email_label": doc.get("client_login_email_label", "Client Email"),
        "client_login_password_label": doc.get("client_login_password_label", "Password"),
        "client_login_button_text": doc.get("client_login_button_text", "Sign In to Client Portal"),
        "client_login_employee_text": doc.get("client_login_employee_text", "Employees and admins:"),
        "client_login_employee_link_text": doc.get("client_login_employee_link_text", "use the main sign-in"),
        "client_login_contact_text": doc.get("client_login_contact_text", "Don't have client access? Contact your administrator."),
        "client_login_primary_color": doc.get("client_login_primary_color", "#0EA5E9"),
        "client_login_primary_hover_color": doc.get("client_login_primary_hover_color", "#0284C7"),
        "client_login_hero_start_color": doc.get("client_login_hero_start_color", "#0EA5E9"),
        "client_login_hero_end_color": doc.get("client_login_hero_end_color", "#0369A1"),
    }


@router.get("")
async def get_settings(request: Request, db=Depends(get_db)):
    await get_current_user(request, db)
    doc = await get_settings_doc(db)
    return {k: v for k, v in doc.items() if k not in ("_id", "created_at")}


@router.put("")
async def update_settings(payload: AppSettingsUpdate, request: Request, db=Depends(get_db)):
    await require_admin(request, db)
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    # Auto-derive currency symbol when only code is provided
    if update.get("currency") and not update.get("currency_symbol"):
        info = CURRENCY_DIRECTORY.get(update["currency"].upper())
        if info:
            update["currency_symbol"] = info["symbol"]
    # Auto-derive tz offset when only tz code is provided
    if update.get("timezone") and update.get("tz_offset_hours") is None:
        match = next((t for t in TIMEZONE_DIRECTORY if t["code"] == update["timezone"]), None)
        if match:
            update["tz_offset_hours"] = match["offset"]
    update["updated_at"] = datetime.now(timezone.utc)
    await db.app_settings.update_one(
        {"key": SETTINGS_KEY},
        {"$set": update, "$setOnInsert": {"key": SETTINGS_KEY, "created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    doc = await get_settings_doc(db)
    return {k: v for k, v in doc.items() if k not in ("_id", "created_at")}


@router.post("/logo")
async def upload_logo(file: UploadFile, request: Request, db=Depends(get_db)):
    await require_admin(request, db)
    data = await file.read()
    path = generate_upload_path("branding", file.filename)
    result = put_object(path, data, file.content_type or "image/png")
    logo_url = to_public_url(result["path"])
    await db.app_settings.update_one(
        {"key": SETTINGS_KEY},
        {"$set": {"brand_logo_url": logo_url, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"brand_logo_url": logo_url}


@router.post("/favicon")
async def upload_favicon(file: UploadFile, request: Request, db=Depends(get_db)):
    await require_admin(request, db)
    data = await file.read()
    path = generate_upload_path("branding", file.filename)
    result = put_object(path, data, file.content_type or "image/png")
    fav_url = to_public_url(result["path"])
    await db.app_settings.update_one(
        {"key": SETTINGS_KEY},
        {"$set": {"favicon_url": fav_url, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"favicon_url": fav_url}


# ---------------------------------------------------------------------------
# Email (SMTP) settings — used by the forgot-password flow.
# Password is stored encrypted and is NEVER returned to the client.
# ---------------------------------------------------------------------------
@router.get("/email")
async def get_email_settings(request: Request, db=Depends(get_db)):
    await require_admin(request, db)
    doc = await get_smtp_doc(db) or {}
    return {
        "smtp_host": doc.get("host", ""),
        "smtp_port": doc.get("port", 587),
        "username": doc.get("username", ""),
        "from_email": doc.get("from_email", ""),
        "has_password": bool(doc.get("password_enc")),
    }


@router.put("/email")
async def update_email_settings(payload: EmailSettingsUpdate, request: Request, db=Depends(get_db)):
    await require_admin(request, db)
    existing = await get_smtp_doc(db)
    update = {
        "key": SMTP_KEY,
        "host": (payload.smtp_host or "").strip(),
        "port": int(payload.smtp_port or 587),
        "username": (payload.username or "").strip(),
        "from_email": (payload.from_email or "").strip(),
        "updated_at": datetime.now(timezone.utc),
    }
    # Password: only overwrite when a new one is supplied; blank keeps current.
    if payload.password:
        update["password_enc"] = encrypt_secret(payload.password)
    await db.app_settings.update_one(
        {"key": SMTP_KEY},
        {"$set": update, "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    doc = await get_smtp_doc(db) or {}
    return {
        "smtp_host": doc.get("host", ""),
        "smtp_port": doc.get("port", 587),
        "username": doc.get("username", ""),
        "from_email": doc.get("from_email", ""),
        "has_password": bool(doc.get("password_enc")),
    }


# ---------------------------------------------------------------------------
# Editable email templates (subject / from-name / HTML body + shortcodes)
# ---------------------------------------------------------------------------
@router.get("/email-templates")
async def list_email_templates(request: Request, db=Depends(get_db)):
    await require_admin(request, db)
    tpls = await get_templates(db)
    smtp = await get_smtp_doc(db) or {}
    resend_on = bool(os.environ.get("RESEND_API_KEY"))
    return {
        "templates": tpls,
        "shortcodes": SHORTCODES,
        "email_configured": bool(smtp.get("host") and smtp.get("password_enc")) or resend_on,
        "transport": "smtp" if smtp.get("host") else ("resend" if resend_on else "none"),
    }


@router.put("/email-templates")
async def update_email_template(payload: dict, request: Request, db=Depends(get_db)):
    await require_admin(request, db)
    key = (payload.get("key") or "").strip()
    if key not in DEFAULT_TEMPLATES:
        raise HTTPException(status_code=400, detail="Unknown template key")
    await save_template(
        db, key,
        (payload.get("from_name") or "").strip(),
        (payload.get("subject") or "").strip(),
        payload.get("body_html") or "",
    )
    return (await get_templates(db))[key]


@router.post("/email/test")
async def send_test_email(payload: dict, request: Request, db=Depends(get_db)):
    await require_admin(request, db)
    to = (payload.get("to") or "").strip()
    if not to or "@" not in to:
        raise HTTPException(status_code=400, detail="A valid recipient email is required")
    key = payload.get("template_key") or "test"
    if key not in DEFAULT_TEMPLATES:
        key = "test"
    sample = {
        "officer_name": "John Doe", "officer_code": "OF-001",
        "post_name": "Main Gate", "post_pin": "1234", "location": "HQ Building",
        "client_name": "Acme Corp", "shift_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "shift_type": "Day", "start_time": "08:00", "end_time": "20:00",
        "timestamp": datetime.now(timezone.utc).strftime("%d %b %Y, %I:%M %p"),
        "shift_details": "<p><b>Officer:</b> John Doe (OF-001)<br><b>Post:</b> Main Gate · Pin 1234</p>",
    }
    r = await render_template(db, key, sample)
    result = await send_email(db, to=to, subject=r["subject"] or "OfficeFlow test email",
                              html=r["html"], from_name=r["from_name"])
    if not result.get("sent"):
        reason = result.get("reason") or "email not configured"
        if reason == "no_api_key":
            reason = "Email is not configured. Add SMTP settings above (or a Resend key) to send email."
        return {"sent": False, "transport": result.get("transport"), "message": reason}
    return {"sent": True, "transport": result.get("transport"),
            "message": f"Test email sent to {to} via {result.get('transport')}."}



@router.get("/currencies")
async def list_currencies():
    return [{"code": k, **v} for k, v in CURRENCY_DIRECTORY.items()]


@router.get("/timezones")
async def list_timezones():
    return TIMEZONE_DIRECTORY


# ---------------------------------------------------------------------------
# Site-wide colour palette (theme)
# ---------------------------------------------------------------------------
# Only super_admin / admin can update. GET is public so the login page can
# render with the brand button colour even before sign-in.
DEFAULT_THEME = {
    # Brand
    "brand_primary":         "#0EA5E9",
    "brand_primary_hover":   "#0284C7",
    "brand_primary_fg":      "#FFFFFF",
    # Table & tools
    "table_header_bg":       "#FBC9FF",
    "table_header_fg":       "#000000",
    "danger":                "#DC2626",
    "success":               "#059669",
    # Shift status
    "status_not_started_bg": "#334155",
    "status_not_started_fg": "#F8FAFC",
    "status_clocked_in_bg":  "#047857",
    "status_clocked_in_fg":  "#ECFDF5",
    "status_clocked_out_bg": "#0369A1",
    "status_clocked_out_fg": "#F0F9FF",
    # Confirmation
    "conf_confirmed_bg":     "#047857",
    "conf_confirmed_fg":     "#ECFDF5",
    "conf_pending_bg":       "#B45309",
    "conf_pending_fg":       "#FFFBEB",
    "conf_no_response_bg":   "#6D28D9",
    "conf_no_response_fg":   "#F5F3FF",
    "conf_declined_bg":      "#BE123C",
    "conf_declined_fg":      "#FFF1F2",
    "conf_not_confirmed_bg": "#334155",
    "conf_not_confirmed_fg": "#F8FAFC",
}


@router.get("/theme")
async def get_theme(request: Request, db=Depends(get_db)):
    """Return the current colour palette merged with defaults. Public: even
    the login screen fetches this to render the brand button colour."""
    doc = await db.app_settings.find_one({"key": "site_theme"})
    stored = (doc or {}).get("values", {}) or {}
    values = {**DEFAULT_THEME, **{k: v for k, v in stored.items() if isinstance(v, str) and v}}
    return {"values": values, "defaults": DEFAULT_THEME}


@router.put("/theme")
async def update_theme(payload: dict, request: Request, db=Depends(get_db)):
    user = await require_admin(request, db)
    incoming = payload.get("values") if isinstance(payload, dict) else None

    if not isinstance(incoming, dict) or not incoming:
        raise HTTPException(
            status_code=400,
            detail="Body must be { values: { token: '#rrggbb', ... } }"
        )

    accepted = {
        k: v.strip()
        for k, v in incoming.items()
        if k in DEFAULT_THEME and isinstance(v, str) and v.strip()
    }

    import re
    hex_re = re.compile(r"^#[0-9A-Fa-f]{6}$")

    bad = [k for k, v in accepted.items() if not hex_re.match(v)]
    if bad:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid colour value(s) for: {', '.join(bad)}"
        )

    if not accepted:
        raise HTTPException(
            status_code=400,
            detail="No valid colour tokens supplied"
        )

    # IMPORTANT:
    # Merge the changed tokens with the existing saved theme instead of
    # replacing the entire values object. This allows the admin panel to
    # update one or more colours without resetting previously customized
    # colours back to their defaults.
    existing_doc = await db.app_settings.find_one(
        {"key": "site_theme"},
        {"_id": 0, "values": 1},
    )

    existing_values = (existing_doc or {}).get("values", {}) or {}
    merged_values = {
        **{
            k: v
            for k, v in existing_values.items()
            if k in DEFAULT_THEME and isinstance(v, str) and v
        },
        **accepted,
    }

    await db.app_settings.update_one(
        {"key": "site_theme"},
        {"$set": {
            "key": "site_theme",
            "values": merged_values,
            "updated_at": datetime.now(timezone.utc),
            "updated_by_id": str(user["_id"]),
            "updated_by_name": user.get("name"),
        }},
        upsert=True,
    )

    # Return the COMPLETE current theme so the frontend state and CSS
    # variables stay synchronized immediately after saving.
    values = {**DEFAULT_THEME, **merged_values}

    return {
        "values": values,
        "defaults": DEFAULT_THEME,
    }


@router.post("/theme/reset")
async def reset_theme(request: Request, db=Depends(get_db)):
    await require_admin(request, db)
    await db.app_settings.delete_one({"key": "site_theme"})
    return {"values": DEFAULT_THEME, "defaults": DEFAULT_THEME}
