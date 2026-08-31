from pydantic import BaseModel
from typing import Optional


class AppSettings(BaseModel):
    brand_name: str = "OfficeFlow"
    brand_logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    site_title: Optional[str] = None
    company_address: Optional[str] = None
    support_email: Optional[str] = None
    contact_phone: Optional[str] = None
    footer_text: Optional[str] = None
    login_hero_title: str = "OfficeFlow"
    login_hero_subtitle: str = "Modern Office Management, HR, Attendance, GPS Tracking & Task Management Platform"
    login_welcome_title: str = "Welcome Back"
    login_welcome_subtitle: str = "Sign in to your OfficeFlow account"
    currency: str = "BDT"  # ISO-4217 code
    currency_symbol: str = "৳"
    # Map provider: "osm" (OpenStreetMap, default) or "google" (Google Maps)
    map_provider: str = "osm"
    google_maps_api_key: Optional[str] = None
    timezone: str = "Asia/Dhaka"
    tz_offset_hours: float = 6.0
    not_found_lottie_enabled: bool = True
    not_found_lottie_url: Optional[str] = None
    # Client portal login page
    client_login_badge: str = "Client Portal"
    client_login_title: str = "Client Sign In"
    client_login_subtitle: str = "Sign in to view your schedules, invoices and reports"
    client_login_hero_title: str = "Client Portal"
    client_login_hero_subtitle: str = "Live dispatch schedules, invoices, wage reports and post-site coverage — everything you need to keep your operation on track."
    client_login_email_label: str = "Client Email"
    client_login_password_label: str = "Password"
    client_login_button_text: str = "Sign In to Client Portal"
    client_login_employee_text: str = "Employees and admins:"
    client_login_employee_link_text: str = "use the main sign-in"
    client_login_contact_text: str = "Don't have client access? Contact your administrator."
    client_login_primary_color: str = "#0EA5E9"
    client_login_primary_hover_color: str = "#0284C7"
    client_login_hero_start_color: str = "#0EA5E9"
    client_login_hero_end_color: str = "#0369A1"


class AppSettingsUpdate(BaseModel):
    brand_name: Optional[str] = None
    brand_logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    site_title: Optional[str] = None
    company_address: Optional[str] = None
    support_email: Optional[str] = None
    contact_phone: Optional[str] = None
    footer_text: Optional[str] = None
    login_hero_title: Optional[str] = None
    login_hero_subtitle: Optional[str] = None
    login_welcome_title: Optional[str] = None
    login_welcome_subtitle: Optional[str] = None
    currency: Optional[str] = None
    currency_symbol: Optional[str] = None
    map_provider: Optional[str] = None
    google_maps_api_key: Optional[str] = None
    timezone: Optional[str] = None
    tz_offset_hours: Optional[float] = None
    not_found_lottie_enabled: Optional[bool] = None
    not_found_lottie_url: Optional[str] = None
    # Client portal login page
    client_login_badge: Optional[str] = None
    client_login_title: Optional[str] = None
    client_login_subtitle: Optional[str] = None
    client_login_hero_title: Optional[str] = None
    client_login_hero_subtitle: Optional[str] = None
    client_login_email_label: Optional[str] = None
    client_login_password_label: Optional[str] = None
    client_login_button_text: Optional[str] = None
    client_login_employee_text: Optional[str] = None
    client_login_employee_link_text: Optional[str] = None
    client_login_contact_text: Optional[str] = None
    client_login_primary_color: Optional[str] = None
    client_login_primary_hover_color: Optional[str] = None
    client_login_hero_start_color: Optional[str] = None
    client_login_hero_end_color: Optional[str] = None


class EmailSettingsUpdate(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None  # blank/omitted = keep existing
    from_email: Optional[str] = None
    email_enabled: Optional[bool] = None
    admin_alert_emails: Optional[str] = None  # comma-separated admin recipients


# ISO-4217 currency directory
CURRENCY_DIRECTORY = {
    "BDT": {"symbol": "৳", "name": "Bangladeshi Taka"},
    "USD": {"symbol": "$", "name": "US Dollar"},
    "EUR": {"symbol": "€", "name": "Euro"},
    "GBP": {"symbol": "£", "name": "British Pound"},
    "INR": {"symbol": "₹", "name": "Indian Rupee"},
    "AED": {"symbol": "د.إ", "name": "UAE Dirham"},
    "SAR": {"symbol": "﷼", "name": "Saudi Riyal"},
    "JPY": {"symbol": "¥", "name": "Japanese Yen"},
    "CNY": {"symbol": "¥", "name": "Chinese Yuan"},
    "AUD": {"symbol": "A$", "name": "Australian Dollar"},
    "CAD": {"symbol": "C$", "name": "Canadian Dollar"},
    "PKR": {"symbol": "₨", "name": "Pakistani Rupee"},
    "SGD": {"symbol": "S$", "name": "Singapore Dollar"},
    "MYR": {"symbol": "RM", "name": "Malaysian Ringgit"},
}

TIMEZONE_DIRECTORY = [
    {"code": "Asia/Dhaka", "label": "Bangladesh (UTC+6)", "offset": 6.0},
    {"code": "Asia/Kolkata", "label": "India (UTC+5:30)", "offset": 5.5},
    {"code": "Asia/Karachi", "label": "Pakistan (UTC+5)", "offset": 5.0},
    {"code": "Asia/Dubai", "label": "UAE (UTC+4)", "offset": 4.0},
    {"code": "UTC", "label": "UTC (UTC+0)", "offset": 0.0},
    {"code": "Europe/London", "label": "London (UTC+0/+1)", "offset": 0.0},
    {"code": "America/New_York", "label": "New York (UTC-5/-4)", "offset": -5.0},
    {"code": "America/Los_Angeles", "label": "Los Angeles (UTC-8/-7)", "offset": -8.0},
    {"code": "Asia/Singapore", "label": "Singapore (UTC+8)", "offset": 8.0},
    {"code": "Asia/Tokyo", "label": "Tokyo (UTC+9)", "offset": 9.0},
]
