"""AutoSoc tail agent: watches log files and POSTs each new line to /api/events/ingest."""
import argparse
import os
import re
import sys
import time
from pathlib import Path

import httpx

NGINX_RE = re.compile(r"(\d{1,3}(?:\.\d{1,3}){3})")
SSH_RE = re.compile(r"from\s+(\d{1,3}(?:\.\d{1,3}){3})")


def extract_ip(line: str, source: str) -> str | None:
    if source == "ssh":
        m = SSH_RE.search(line)
        if m:
            return m.group(1)
    m = NGINX_RE.search(line)
    return m.group(1) if m else None


def tail(path: Path):
    with path.open("r", errors="ignore") as f:
        f.seek(0, os.SEEK_END)
        while True:
            line = f.readline()
            if not line:
                time.sleep(0.4)
                continue
            yield line.rstrip()


def main():
    ap = argparse.ArgumentParser(description="AutoSoc tail agent")
    ap.add_argument("--file", required=True, help="Path to log file to tail")
    ap.add_argument("--source", required=True, choices=["ssh", "nginx", "postgres"])
    ap.add_argument("--url", default="http://127.0.0.1:8000/api/events/ingest")
    ap.add_argument("--use-ai", action="store_true", help="Use Claude scoring (slower)")
    args = ap.parse_args()

    p = Path(args.file)
    if not p.exists():
        print(f"file not found: {p}", file=sys.stderr)
        sys.exit(1)

    print(f"[agent] tailing {p} -> {args.url} (source={args.source})")
    for line in tail(p):
        ip = extract_ip(line, args.source)
        if not ip:
            continue
        try:
            r = httpx.post(
                args.url,
                json={"source": args.source, "src_ip": ip, "raw": line},
                params={"use_ai": "true"} if args.use_ai else None,
                timeout=5.0,
            )
            print(f"[agent] {r.status_code} ip={ip} sev={r.json().get('severity','?')}")
        except Exception as e:
            print(f"[agent] error: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
