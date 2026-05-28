import re
from datetime import datetime

SSH_FAIL = re.compile(
    r"(?P<ts>\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2}).*sshd.*"
    r"(Failed password|Invalid user|authentication failure).*from\s+(?P<ip>\d{1,3}(?:\.\d{1,3}){3})"
)


def parse_ssh_line(line: str) -> dict | None:
    m = SSH_FAIL.search(line)
    if not m:
        return None
    return {
        "source": "ssh",
        "src_ip": m.group("ip"),
        "raw": line.strip(),
        "ts_text": m.group("ts"),
        "timestamp": datetime.utcnow(),
    }
