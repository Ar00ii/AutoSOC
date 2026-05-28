from functools import lru_cache

import httpx

COUNTRY_COORDS = {
    "CN": (39.9042, 116.4074, "China"),
    "RU": (55.7558, 37.6173, "Russia"),
    "US": (38.8951, -77.0364, "United States"),
    "BR": (-15.7942, -47.8822, "Brazil"),
    "IN": (28.6139, 77.2090, "India"),
    "NG": (9.0820, 8.6753, "Nigeria"),
    "DE": (52.5200, 13.4050, "Germany"),
    "FR": (48.8566, 2.3522, "France"),
    "GB": (51.5074, -0.1278, "United Kingdom"),
    "JP": (35.6762, 139.6503, "Japan"),
    "KP": (39.0392, 125.7625, "North Korea"),
    "IR": (35.6892, 51.3890, "Iran"),
    "ES": (40.4168, -3.7038, "Spain"),
    "MX": (19.4326, -99.1332, "Mexico"),
    "TR": (39.9334, 32.8597, "Turkey"),
    "ID": (-6.2088, 106.8456, "Indonesia"),
    "PK": (33.6844, 73.0479, "Pakistan"),
    "VN": (21.0285, 105.8542, "Vietnam"),
    "UA": (50.4501, 30.5234, "Ukraine"),
    "RO": (44.4268, 26.1025, "Romania"),
    "NL": (52.3676, 4.9041, "Netherlands"),
    "SG": (1.3521, 103.8198, "Singapore"),
    "BG": (42.6977, 23.3219, "Bulgaria"),
}


import re

_IP_OK = re.compile(r"^[0-9a-fA-F:.]{3,45}$")


@lru_cache(maxsize=4096)
def lookup_ip(ip: str) -> dict:
    if not ip or not _IP_OK.match(ip):
        return {"country": "??", "country_name": "Unknown", "city": "", "lat": 0.0, "lng": 0.0}
    try:
        r = httpx.get(f"https://ipwho.is/{ip}", timeout=2.5)
        d = r.json()
        if d.get("success"):
            return {
                "country": (d.get("country_code") or "??").upper()[:2],
                "country_name": d.get("country") or "Unknown",
                "city": d.get("city") or "",
                "lat": float(d.get("latitude") or 0.0),
                "lng": float(d.get("longitude") or 0.0),
            }
    except Exception:
        pass
    return {"country": "??", "country_name": "Unknown", "city": "", "lat": 0.0, "lng": 0.0}


def country_coords(code: str) -> tuple[float, float]:
    if code in COUNTRY_COORDS:
        lat, lng, _ = COUNTRY_COORDS[code]
        return lat, lng
    return 0.0, 0.0
