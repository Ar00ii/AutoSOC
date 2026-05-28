import platform
import subprocess

from .config import settings


def apply_block(ip: str) -> dict:
    """Returns {applied: bool, mode: str, output: str}. Default safe: no-op."""
    if not settings.apply_firewall:
        return {"applied": False, "mode": "recommendation-only", "output": ""}
    sysname = platform.system().lower()
    try:
        if "linux" in sysname:
            r = subprocess.run(
                ["iptables", "-I", "INPUT", "-s", ip, "-j", "DROP"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            return {
                "applied": r.returncode == 0,
                "mode": "iptables",
                "output": (r.stdout + r.stderr).strip(),
            }
        if "windows" in sysname:
            r = subprocess.run(
                [
                    "netsh", "advfirewall", "firewall", "add", "rule",
                    f"name=sentinel-block-{ip}",
                    "dir=in", "action=block", f"remoteip={ip}",
                ],
                capture_output=True,
                text=True,
                timeout=5,
            )
            return {
                "applied": r.returncode == 0,
                "mode": "netsh",
                "output": (r.stdout + r.stderr).strip(),
            }
    except Exception as e:
        return {"applied": False, "mode": "error", "output": str(e)}
    return {"applied": False, "mode": "unsupported", "output": sysname}
