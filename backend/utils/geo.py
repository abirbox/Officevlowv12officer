"""Geo helpers for shift geofencing."""
from math import radians, sin, cos, asin, sqrt
from typing import Optional, Tuple

EARTH_RADIUS_M = 6371000.0


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two lat/lng points, in meters."""
    lat1, lon1, lat2, lon2 = map(radians, (lat1, lon1, lat2, lon2))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * asin(sqrt(a))


def geofence_check(site: dict, lat: Optional[float], lng: Optional[float]
                   ) -> Tuple[bool, Optional[float], bool]:
    """Return (within, distance_m, configured).

    - configured is False when the post site has no coordinates; callers should
      then allow the action (nothing to enforce against).
    - within is True when the point is inside the radius (or geofence unset).
    """
    clat = site.get("latitude")
    clng = site.get("longitude")
    if clat is None or clng is None:
        return True, None, False
    radius = site.get("geofence_radius_m") or 150
    if lat is None or lng is None:
        return False, None, True
    dist = haversine_m(float(clat), float(clng), float(lat), float(lng))
    return dist <= float(radius), dist, True
