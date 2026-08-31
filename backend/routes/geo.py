"""Geocoding proxy so the browser never calls Nominatim directly (their usage
policy forbids heavy anonymous browser use). We add a proper User-Agent, a
short in-memory TTL cache, and return a clean suggestion list."""
import time
import httpx
from fastapi import APIRouter, Request, Depends, Query

from utils.auth import get_current_user

router = APIRouter(prefix="/geo", tags=["Geocoding"])

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "OfficeFlow-Dispatch/1.0 (dispatch location search)"
_CACHE: dict[str, tuple[float, list]] = {}
_TTL = 300  # seconds


def get_db(request: Request):
    return request.app.state.db


@router.get("/autocomplete")
async def autocomplete(request: Request, q: str = Query(..., min_length=3),
                       limit: int = 6, db=Depends(get_db)):
    """OpenStreetMap address suggestions for the current query."""
    await get_current_user(request, db)  # auth-gated to avoid abuse
    key = q.strip().lower()
    now = time.time()
    cached = _CACHE.get(key)
    if cached and now - cached[0] < _TTL:
        return {"suggestions": cached[1]}
    try:
        async with httpx.AsyncClient(timeout=8.0, headers={"User-Agent": USER_AGENT}) as client:
            resp = await client.get(NOMINATIM_URL, params={
                "format": "json", "addressdetails": 1, "limit": limit, "q": q,
            })
        if resp.status_code != 200:
            return {"suggestions": [], "error": f"geocoder returned {resp.status_code}"}
        data = resp.json()
    except Exception as e:  # noqa: BLE001
        return {"suggestions": [], "error": str(e)}
    out = [{
        "label": d.get("display_name"),
        "lat": float(d["lat"]),
        "lng": float(d["lon"]),
    } for d in data if d.get("lat") and d.get("lon")]
    _CACHE[key] = (now, out)
    if len(_CACHE) > 500:
        _CACHE.clear()
    return {"suggestions": out}
