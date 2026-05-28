import re
from datetime import datetime

NGINX = re.compile(
    r'(?P<ip>\d{1,3}(?:\.\d{1,3}){3})\s+\S+\s+\S+\s+'
    r'\[(?P<ts>[^\]]+)\]\s+'
    r'"(?P<method>\S+)\s+(?P<path>[^"\s]+)[^"]*"\s+'
    r'(?P<status>\d{3})\s+(?P<bytes>\d+)'
)


def parse_nginx_line(line: str) -> dict | None:
    m = NGINX.search(line)
    if not m:
        return None
    return {
        "source": "nginx",
        "src_ip": m.group("ip"),
        "raw": line.strip(),
        "method": m.group("method"),
        "path": m.group("path"),
        "status": int(m.group("status")),
        "timestamp": datetime.utcnow(),
    }
