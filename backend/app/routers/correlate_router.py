from fastapi import APIRouter, Depends

from ..auth import require

router = APIRouter(prefix="/api/correlate", tags=["correlate"])

RULES = [
    {
        "id": "ssh_brute_force_burst",
        "severity_escalation": "high",
        "window_minutes": 15,
        "description": "8+ failed SSH brute_force events from same IP",
        "category_match": "brute_force",
        "threshold": 8,
    },
    {
        "id": "credential_stuffing_with_success",
        "severity_escalation": "critical",
        "window_minutes": 15,
        "description": "Brute force followed by anomalous activity from same IP (possible compromise)",
        "category_match": "brute_force + anomaly",
        "threshold": None,
    },
    {
        "id": "recon_then_exploit",
        "severity_escalation": "critical",
        "window_minutes": 15,
        "description": "Recon scan followed by SQLi attempt from same IP",
        "category_match": "recon + sqli",
        "threshold": None,
    },
    {
        "id": "scan_then_rce",
        "severity_escalation": "critical",
        "window_minutes": 15,
        "description": "Port/service scan followed by RCE attempt from same IP",
        "category_match": "scan + rce",
        "threshold": None,
    },
    {
        "id": "repeated_critical",
        "severity_escalation": "critical",
        "window_minutes": 15,
        "description": "3+ critical-severity events from same IP",
        "category_match": "any",
        "threshold": 3,
    },
]


@router.get("/rules")
def list_rules(_=Depends(require("settings", "view"))):
    return {"engine": "app/correlate.py", "rules": RULES}
