"""Compute a shift's real UTC start/end from its date + HH:MM wall-clock times.

Schedule times are stored as HH:MM strings interpreted in the org default
timezone (Asia/Dhaka). Overnight shifts (end <= start) roll the end to the next
calendar day.
"""
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import Optional, Tuple

from utils.tz import DEFAULT_TZ

UMA = "UMA"


def shift_bounds_utc(date_str: Optional[str], start_hhmm: Optional[str],
                     end_hhmm: Optional[str], tz_code: str = DEFAULT_TZ
                     ) -> Tuple[Optional[datetime], Optional[datetime]]:
    if not date_str or start_hhmm in (None, "", UMA) or end_hhmm in (None, "", UMA):
        return None, None
    try:
        tz = ZoneInfo(tz_code)
        y, m, d = (int(x) for x in date_str.split("-"))
        sh, sm = (int(x) for x in start_hhmm.split(":"))
        eh, em = (int(x) for x in end_hhmm.split(":"))
        start = datetime(y, m, d, sh, sm, tzinfo=tz)
        end = datetime(y, m, d, eh, em, tzinfo=tz)
        if end <= start:
            end += timedelta(days=1)
        return start.astimezone(timezone.utc), end.astimezone(timezone.utc)
    except Exception:
        return None, None
