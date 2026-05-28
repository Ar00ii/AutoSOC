from collections import defaultdict, deque
from datetime import datetime, timedelta

_window: dict[str, deque] = defaultdict(lambda: deque(maxlen=200))


def push(ip: str, category: str, severity: str) -> dict | None:
    """Returns an upgraded incident if rules match."""
    now = datetime.utcnow()
    _window[ip].append({"t": now, "cat": category, "sev": severity})

    recent = [e for e in _window[ip] if now - e["t"] < timedelta(minutes=15)]
    cats = {e["cat"] for e in recent}
    sevs = [e["sev"] for e in recent]

    if cats >= {"brute_force"} and len([e for e in recent if e["cat"] == "brute_force"]) >= 8:
        return {
            "rule": "ssh_brute_force_burst",
            "severity": "high",
            "summary": f"Sustained SSH brute force from {ip} ({len(recent)} events in 15min)",
        }
    if cats >= {"brute_force", "anomaly"}:
        return {
            "rule": "credential_stuffing_with_success",
            "severity": "critical",
            "summary": f"Possible credential stuffing then access from {ip}",
        }
    if cats >= {"recon", "sqli"}:
        return {
            "rule": "recon_then_exploit",
            "severity": "critical",
            "summary": f"Recon followed by SQLi from {ip}",
        }
    if cats >= {"scan", "rce"}:
        return {
            "rule": "scan_then_rce",
            "severity": "critical",
            "summary": f"Scan followed by RCE attempt from {ip}",
        }
    if "critical" in sevs and len([s for s in sevs if s == "critical"]) >= 3:
        return {
            "rule": "repeated_critical",
            "severity": "critical",
            "summary": f"{len([s for s in sevs if s == 'critical'])} critical events from {ip} in 15min",
        }
    return None
