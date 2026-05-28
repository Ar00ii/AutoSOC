# AutoSoc roadmap

Where AutoSoc is going and why. This is a working doc — features move
between tiers as the market and user feedback evolve.

## Where we are — v0.7 (current)

Shipped in this sprint:
- **Threat Intelligence module** — pulls abuse.ch URLhaus, ThreatFox, AlienVault OTX, MISP. Auto-IoC match against incoming events with severity escalation. 21 k+ live malware URLs ingested on first pull from abuse.ch.
- **Cases (Incidents)** — full lifecycle: open → investigating → contained → closed. Auto-numbering (`CASE-YYYY-NNNN`), SLA computation by severity, timeline, kill-chain tracking, notes, event grouping.
- **Playbooks engine** — YAML-defined IR flows with templated args, approval gates, agent-tool reuse. 2 default playbooks seeded.

Still from v0.6:
- AI-assisted SIEM (Claude scoring, NL search, AI reports)
- 3D threat globe
- MITRE ATT&CK mapping, AbuseIPDB enrichment
- Autonomous Claude agents (tool-use loop, per-tool RBAC)
- RBAC, MFA (TOTP), OIDC SSO, refresh-token rotation
- 49 tests + audit.sh

## Tier 2 — next sprint (v0.8)

These differentiate AutoSoc from a homelab toy to a real SOC tool.
Pick whichever your customers ask for first.

### Custom rule editor (Sigma-compatible)
**Why:** users need to write their own correlation rules without code.
**What:**
- `Rule` model: name, body (Sigma YAML), enabled, severity, mitre_id
- Editor in admin → live preview against last 1k events
- Sigma → SQL translator for the standard subset (eq, contains, regex, count_by, time window)
- Bundle 50 starter rules from SigmaHQ public repo
**Where:** new `app/rules.py`, `app/routers/rules.py`, frontend `/admin/rules`

### Endpoint agent (Windows + Linux telemetry)
**Why:** EDR-style visibility without buying CrowdStrike. Required for
detection beyond log ingest.
**What:**
- Lightweight Go binary (≤ 8 MB) that ships:
  - Process exec (Linux: ptrace/eBPF; Windows: ETW)
  - File writes to sensitive paths (`/etc/`, `C:\Windows\System32\`)
  - Outbound netconn (5-tuple + process)
  - Registry edits (Windows)
- Push to `/api/events/ingest` with HMAC signature
- Local buffer + retry on backend down
**Where:** new repo `autosoc-agent/`, ingest parser at `app/ingest/endpoint.py`

### SLA tracking + on-call integration
**Why:** SOC managers measure on MTTR. Without SLA, no enterprise sale.
**What:**
- SLA already computed on case create — surface in UI with countdown
- Webhook to PagerDuty / Opsgenie / Splunk On-Call when SLA at 80 %
- Email digest "open cases past SLA" at shift handover times
- Per-analyst MTTR dashboard
**Where:** `app/sla.py`, `app/notify.py` extension

### Bidirectional Slack / Teams bot
**Why:** analysts live in Slack. Switching tabs costs MTTR.
**What:**
- Slash commands: `/autosoc case 4127`, `/autosoc block 1.2.3.4`,
  `/autosoc approve run 248`, `/autosoc assign me`
- Case threads auto-created when severity ≥ high
- Inline buttons: Assign / Close / Escalate
- Bidirectional: status changes in Slack reflect in AutoSoc and vice versa
**Where:** `app/integrations/slack.py`, Slack app manifest in `marketing/`

### Multi-source ingest (the integrations everybody wants)

Implement one parser per sprint. Prioritisation by market demand:

1. **AWS CloudTrail** — `app/ingest/cloudtrail.py` (S3 polling + Kinesis option)
2. **Office 365 / Azure AD** — Graph API audit log poller
3. **Okta system log** — `/api/v1/logs` poller with cursor
4. **Sysmon (Windows)** — XML parser + Sigma rule compat
5. **Windows Event Log** — channel subscription via WEC or agent
6. **Kubernetes audit logs** — API server log + webhook receiver
7. **GitHub audit log** — Enterprise audit log API
8. **Generic webhook receiver** — accept any JSON, infer fields with Claude on first sample

### Phishing email pipeline
**Why:** phishing is the #1 entry vector for ransomware. Differentiator.
**What:**
- Email submission endpoint (forward .eml as attachment)
- Header analysis (SPF / DKIM / DMARC, return-path mismatch)
- URL extraction → urlscan.io + URLhaus IoC match
- Attachment hash → VirusTotal + ThreatFox
- AI verdict: phishing / credential harvest / malware delivery / benign
- One-click "quarantine in Office 365 / Google Workspace" action

## Tier 3 — market expansion (v0.9 → v1.0)

These open up customer segments we can't sell to today.

### Multi-tenant (MSSP support)
**Why:** MSSPs are the volume play. One MSSP = 30+ tenant customers.
**What:**
- `Tenant` model, every other table FK to tenant_id
- Row-level filter middleware
- Per-tenant data isolation, dashboard, branding
- Cross-tenant search (admin only) for threat trend analysis
- Per-tenant billing meter
**Risk:** big refactor. Do this BEFORE you have 5+ customers, not after.

### Compliance dashboards
**Why:** what unlocks the procurement / legal sign-off.
**Coverage:**
- **SOC 2 Type II** — control evidence (CC6.x access, CC7.x ops, CC8.x change mgmt)
- **PCI-DSS 4.0** — req 10 (logging), req 11 (monitoring)
- **HIPAA** — § 164.312 (audit controls)
- **GDPR** — Art. 32 + 33 (security + breach notification)
- **ISO 27001 Annex A** — A.12 ops, A.16 incident mgmt
**What:** report templates + scheduled PDF + control-to-evidence mapping

### Postgres + Redis + multi-replica
**Why:** SQLite caps at ~5 M events. Beyond that you need real DB.
**What:**
- SQLAlchemy already abstracts the engine; switch `DB_URL` to Postgres
- Alembic migrations from day 1 of this work
- Redis for: rate limiter, account lockout, SSE tickets, playbook approval state
- Stateless API behind nginx — N replicas
- Docker Compose with prod profile
- Helm chart for K8s
**Coverage target:** 50 M events / 200 events/sec sustained

### Real EDR integrations
**Why:** customers already pay for CrowdStrike / SentinelOne / Defender ATP.
AutoSoc becomes the single pane of glass.
**What:**
- CrowdStrike Falcon API: ingest detections + push containment (Real-Time Response)
- SentinelOne API: alerts + disconnect endpoint
- Microsoft Defender ATP: incident sync + machine isolation
- Bidirectional: AutoSoc case ↔ vendor incident

### Identity response (deshabilitar user)
**What:**
- Active Directory: disable account, force password reset, kick sessions
- Azure AD: revoke refresh tokens, sign-in block
- Okta: deactivate user
- Google Workspace: suspend
- Each as a playbook tool

### Cloud response
**What:**
- AWS: revoke IAM key, attach quarantine SG, snapshot EC2, isolate VPC
- GCP: equivalent IAM + firewall rules
- Azure: NSG quarantine, conditional access policy

## Tier 4 — moonshot (v1.x)

Stuff that's hard but creates moats.

### UEBA (user / entity behaviour analytics)
- Per-user / per-host baseline (login times, GeoIP, daily byte volume, command verbs)
- Z-score anomaly + clustering (DBSCAN) for outlier detection
- Surfaces in UI as "John Smith — 87 % anomalous behaviour"
- Feeds the agent loop as additional context

### Vector DB of past incidents
- pgvector / Qdrant index over case summaries
- "Find similar incidents to this one" surface in case view
- AI suggests next-best-action from past resolutions
- Cross-tenant trend detection (anonymised)

### Auto-tuning correlation rules
- Track analyst feedback (true positive / false positive per rule)
- Rules with FP > 30 % get queued for tuning
- Claude proposes adjusted YAML; admin approves
- Closed loop: rules improve with use

### Tabletop exercise mode
- Fake incident generator with realistic timeline
- Track analyst response time / actions
- Replay mode for training
- Compliance: most certifications require annual tabletop

## What we are NOT going to build

Discipline of saying no:

- ❌ Network packet capture / DPI — that's a different product (Zeek/Suricata)
- ❌ Full vulnerability scanner — partner with Tenable/Qualys instead
- ❌ Mobile threat defence — separate market
- ❌ Generic ticketing — we are not Jira
- ❌ Custom email server — we ingest from your provider
- ❌ "AutoSoc OS" — we are a SaaS, not an OS distribution

## Pricing tier mapping

| Feature | Self-host | Team ($49/seat) | Enterprise (custom) |
|---------|-----------|-----------------|---------------------|
| Core SIEM + Globe + Agents (v0.6) | ✓ | ✓ | ✓ |
| Threat Intel (URLhaus + ThreatFox, no key) | ✓ | ✓ | ✓ |
| OTX / MISP feeds | BYO key | included | included |
| Cases + Playbooks | ✓ | ✓ | ✓ |
| Sigma rule editor (v0.8) | ✓ | ✓ | ✓ |
| Endpoint agent (v0.8) | ✓ | ✓ | ✓ |
| Slack/Teams bot | — | ✓ | ✓ |
| SLA + PagerDuty | — | ✓ | ✓ |
| Compliance reports | — | — | ✓ |
| Multi-tenant (MSSP) | — | — | ✓ |
| EDR / cloud integrations | — | partial | ✓ |
| Dedicated Claude budget | BYO key | $20/seat | included |
| SLA 99.5 % | — | ✓ | 99.9 % |
| SSO (SAML) | OIDC only | OIDC | SAML + OIDC |
| Named engineer | — | — | ✓ |

## Implementation order (concrete next 10 commits)

1. Frontend `/admin/ti` page — list feeds, IoC search, manual pull button
2. Frontend `/cases` page — list, detail with timeline, kill-chain viz
3. Frontend `/playbooks` page — list, editor with YAML syntax highlight
4. Wire ingest pipeline to call `ti.apply_match_to_event()` + `playbooks.matching_playbooks()`
5. Add `on_critical` trigger that fires matching playbooks automatically
6. Tests for the 3 new modules (target: 70+ tests total)
7. Sigma rule parser + editor (v0.8 starts)
8. Endpoint agent scaffolding in Go
9. Slack app skeleton + slash command router
10. CloudTrail ingest parser

## How to contribute / pick the next thing

If you (or a customer) needs feature X tomorrow, scan this list, find
the closest match, file an issue with the **business case + 1-line spec**.
We promote items between tiers based on:

1. Number of paying customers blocked
2. Effort vs. revenue
3. How much it reduces total cost of ownership for the customer

The roadmap is opinionated, not sacred.
