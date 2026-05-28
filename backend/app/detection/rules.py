from collections import defaultdict
from datetime import datetime, timedelta

_ip_counters: dict[str, list[datetime]] = defaultdict(list)


def record_hit(ip: str) -> int:
    now = datetime.utcnow()
    window = now - timedelta(minutes=10)
    bucket = _ip_counters[ip] = [t for t in _ip_counters[ip] if t >= window]
    bucket.append(now)
    return len(bucket)


def brute_force_threshold(ip: str) -> bool:
    return record_hit(ip) >= 5


SUSPICIOUS_PATHS = (
    "/.env", "/admin", "/wp-login", "/.git", "/phpmyadmin",
    "/etc/passwd", "/cgi-bin", "/.aws", "/server-status",
)

SQLI_TOKENS = (
    "union select", "' or '1'='1", "sleep(", "benchmark(",
    "or 1=1", "--", "xp_cmdshell", "load_file(",
)

XSS_TOKENS = ("<script", "javascript:", "onerror=", "onload=")


def quick_classify(source: str, line: str) -> tuple[str, str]:
    low = line.lower()
    if any(t in low for t in SQLI_TOKENS):
        return "high", "sqli"
    if any(t in low for t in XSS_TOKENS):
        return "high", "xss"
    if any(p in low for p in SUSPICIOUS_PATHS):
        return "medium", "recon"
    if "failed password" in low or "invalid user" in low or "authentication failure" in low:
        return "medium", "brute_force"
    return "low", "anomaly"
