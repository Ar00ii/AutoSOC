CATEGORY_TO_MITRE = {
    "brute_force": ("T1110", "Brute Force", "credential-access"),
    "sqli": ("T1190", "Exploit Public-Facing Application", "initial-access"),
    "xss": ("T1059.007", "JavaScript", "execution"),
    "rce": ("T1059", "Command and Scripting Interpreter", "execution"),
    "scan": ("T1595", "Active Scanning", "reconnaissance"),
    "recon": ("T1595.002", "Vulnerability Scanning", "reconnaissance"),
    "exfil": ("T1041", "Exfiltration Over C2 Channel", "exfiltration"),
    "anomaly": ("T1078", "Valid Accounts", "defense-evasion"),
}


def map_category(cat: str) -> dict:
    if cat in CATEGORY_TO_MITRE:
        tid, name, tactic = CATEGORY_TO_MITRE[cat]
        return {"mitre_id": tid, "mitre_name": name, "mitre_tactic": tactic}
    return {"mitre_id": "", "mitre_name": "", "mitre_tactic": ""}
