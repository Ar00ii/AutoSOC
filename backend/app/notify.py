import httpx

from .config import settings
from .security import is_url_safe_outbound


def notify(title: str, text: str, severity: str = "high") -> bool:
    if not settings.notify_webhook:
        return False
    ok, _ = is_url_safe_outbound(settings.notify_webhook)
    if not ok:
        return False
    payload = _slack_format(title, text, severity)
    try:
        r = httpx.post(settings.notify_webhook, json=payload, timeout=4.0)
        return r.status_code < 400
    except Exception:
        return False


def _slack_format(title: str, text: str, severity: str) -> dict:
    indicator = {"low": "·", "medium": "··", "high": "===", "critical": "===!==="}.get(
        severity, "·"
    )
    return {
        "text": f"[{severity.upper()}] {title}",
        "blocks": [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*{indicator} AutoSoc {indicator}*\n*{title}*\n```{text}```",
                },
            }
        ],
    }
