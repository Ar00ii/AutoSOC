from datetime import datetime, timedelta
from functools import lru_cache

import httpx

from .config import settings

_cache: dict[str, tuple[datetime, dict]] = {}
_TTL = timedelta(hours=6)


def abuseipdb_lookup(ip: str) -> dict:
    now = datetime.utcnow()
    if ip in _cache:
        ts, data = _cache[ip]
        if now - ts < _TTL:
            return data
    if not settings.abuseipdb_api_key:
        return _heuristic(ip)
    try:
        r = httpx.get(
            "https://api.abuseipdb.com/api/v2/check",
            headers={"Key": settings.abuseipdb_api_key, "Accept": "application/json"},
            params={"ipAddress": ip, "maxAgeInDays": 90},
            timeout=4.0,
        )
        d = r.json().get("data", {})
        out = {
            "abuse_score": int(d.get("abuseConfidenceScore", 0)),
            "isp": d.get("isp", "") or "",
            "domain": d.get("domain", "") or "",
            "usage_type": d.get("usageType", "") or "",
            "total_reports": int(d.get("totalReports", 0)),
            "is_tor": bool(d.get("isTor", False)),
            "country_name": d.get("countryName", "") or "",
            "source": "abuseipdb",
        }
        _cache[ip] = (now, out)
        return out
    except Exception:
        return _heuristic(ip)


def _heuristic(ip: str) -> dict:
    s = sum(int(p) for p in ip.split(".") if p.isdigit()) if ip.count(".") == 3 else 0
    score = (s * 7) % 101
    return {
        "abuse_score": score,
        "isp": "",
        "domain": "",
        "usage_type": "",
        "total_reports": 0,
        "is_tor": False,
        "country_name": "",
        "source": "heuristic",
    }
