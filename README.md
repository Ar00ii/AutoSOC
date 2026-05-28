# AutoSoc

> A self-hosted SOC platform — built in 2 days with Claude Code.

3D live threat map, AI agents with Claude tool-use, full RBAC with MFA + OIDC SSO, MITRE ATT&CK mapping, live correlation engine, AI-written incident reports, 49 passing security tests, dockerized.

---

## Highlights

- **3D threat map** — real country borders (orthographic projection of Natural Earth GeoJSON), live arcs over SSE, hit-density per country
- **AI Agents** — Claude tool-use loop with an admin-curated toolbox (`query_events`, `ip_intel`, `create_ticket`, `recommend_block`, `notify`, `query_tickets`). Per-tool RBAC enforced at runtime. Triggers: `manual`, `on_critical`, `scheduled` (cron)
- **RBAC** — 14 resources × 5 actions matrix, 5 built-in roles (admin / analyst / L1 / viewer / agent) + custom. Teams scope events per source/category/severity/country
- **Auth** — JWT access + refresh rotation, **TOTP MFA** with QR enrolment + Fernet-encrypted secret, **OIDC SSO** (Auth0/Okta/Azure/Google), forgot-password flow, active sessions/devices management
- **Threat intel** — AbuseIPDB enrichment with 6h cache, MITRE ATT&CK mapping on every event, correlation engine chaining recon → exploit
- **Hardened** — SSRF guards, rate limits, account lockout, HMAC-keyed API tokens, CSV-injection-safe exports, CSP, HSTS, security headers, audit log of every operator action
- **Migration** — Bulk NDJSON ingest, IOC list import — bring data from your existing SIEM
- **Tests** — 49 passing pytest (33 unit + 16 integration via FastAPI TestClient)
- **Deploy** — Dockerfiles, docker-compose, nginx with TLS termination + per-path rate limits + SSE-aware proxying

---

## Quick start

### Local dev

```bash
# Backend
cd backend
python -m venv .venv
source .venv/Scripts/activate     # Windows
# source .venv/bin/activate       # macOS/Linux
pip install -r requirements.txt
python seed.py
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open <http://localhost:3000>. Default login: `admin@autosoc.local` / `admin`.

### Production (Docker + nginx + TLS)

```bash
cp .env.example .env
# Generate strong secrets:
echo "JWT_SECRET=$(python -c 'import secrets; print(secrets.token_urlsafe(48))')" >> .env
echo "ADMIN_PASSWORD=$(python -c 'import secrets; print(secrets.token_urlsafe(24))')" >> .env

# TLS cert (self-signed for local; use Let's Encrypt in prod):
mkdir -p nginx/certs
openssl req -x509 -newkey rsa:4096 -nodes -days 365 \
  -keyout nginx/certs/privkey.pem -out nginx/certs/fullchain.pem \
  -subj "/CN=autosoc.local"

docker compose up -d --build
```

Open <https://localhost>. `AUTH_REQUIRED=true` is enforced; the backend refuses to start with a weak `JWT_SECRET`.

---

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI · SQLAlchemy · SQLite · sse-starlette · APScheduler · authlib · pyotp · cryptography |
| Frontend | Next.js 14 (App Router) · Tailwind · react-globe.gl · SWR · IBM Plex Mono |
| AI | Anthropic Claude (Haiku 4.5 + Sonnet 4.6) via tool-use |
| Auth | JWT (access 15min + refresh 14d), HMAC API keys, TOTP MFA, OIDC SSO |
| Deploy | Docker + nginx (TLS, HSTS, rate limits, SSE proxy) |

---

## Project structure

```
backend/                    FastAPI app
  app/
    routers/                /api/* endpoints
    agent_tools.py          Toolbox callable by AI agents
    agents.py               Claude tool-use runner
    scoping.py              Team event-filter enforcement
    security.py             SSRF guard, rate limiter, lockout, HMAC, password policy
    correlate.py            Correlation rule engine
    scheduler.py            APScheduler: token cleanup + scheduled agents + on_critical hook
  Dockerfile
frontend/                   Next.js app
  app/                      Pages
  components/               Sidebar, Globe, IpPanel, CriticalToast, etc.
  hooks/                    useLiveStream (SSE), useKeyboard
  lib/                      auth helpers, fetcher with auto-refresh
  Dockerfile
nginx/                      Production reverse proxy config
docker-compose.yml
```

---

## Pages

| Path | Purpose |
|---|---|
| `/` | Dashboard with 3D globe, stats, top-N, correlations ticker |
| `/events` | Filterable event stream + NL search + saved searches + CSV export |
| `/tickets` | Incident queue |
| `/blocks` | Applied IP blocks |
| `/recommendations` | Pending block recommendations |
| `/agents` | AI agent CRUD with per-tool grants |
| `/agents/runs` | Global run history across agents |
| `/reports` | AI-generated incident reports |
| `/audit` | Operator action log |
| `/admin/users` · `/roles` · `/teams` · `/keys` · `/migrate` · `/rules` | Admin |
| `/account` · `/account/sessions` | Self-service password, MFA, active sessions |
| `/forgot` · `/reset` | Password recovery |
| `/settings` | Detection / AI / Threat intel / Notifications config |

---

## Key endpoints

```
POST /api/auth/login                  Login (returns access + refresh)
POST /api/auth/login/mfa              Second step when MFA enabled
POST /api/auth/refresh                Refresh rotation (jti revoked + reissued)
POST /api/auth/mfa/setup              TOTP secret + QR + provisioning URI
GET  /api/auth/sessions               Active devices for current user
GET  /api/auth/oidc/login             OIDC redirect (when configured)

POST /api/events/ingest               Ingest a log line (auto enrich + correlate + on_critical)
GET  /api/events                      List with filters (severity/source/category/country/ip/text)
GET  /api/stream?ticket=...           SSE live event stream (per-team filtered)
GET  /api/intel/ip/{ip}               Investigation: geo + AbuseIPDB + AI summary
GET  /api/dashboard/timeseries        Per-hour event buckets
GET  /api/dashboard/top               Top IPs / countries / categories / MITRE
GET  /api/export/events.csv           CSV (formula-injection-safe)
GET  /api/correlate/rules             Correlation rules listing

POST /api/agents/{id}/run             Run agent with input dict
GET  /api/agents/runs/all             Global runs (filter by triggered_by / status)
POST /api/migrate/bulk_ingest         NDJSON bulk ingest
POST /api/migrate/ioc_import          CSV/list of IPs → block recommendations

POST /api/notify/test                 Test the configured webhook
GET/DELETE /api/keys                  API keys CRUD
GET/POST/PATCH/DELETE /api/{users,roles,teams}  RBAC admin
GET  /api/audit                       Operator action log
```

---

## Tail agent

Ship live logs from any host:

```bash
python backend/tail_agent.py --file /var/log/auth.log --source ssh
python backend/tail_agent.py --file /var/log/nginx/access.log --source nginx --use-ai
```

Each new line is posted to `/api/events/ingest` → enriched → broadcast via SSE → the 3D globe updates in real time.

---

## Security model

- **Anonymous mode** (`AUTH_REQUIRED=false`, the default for local dev) — every request runs as admin. **Warning logged on boot.**
- **Production mode** (`AUTH_REQUIRED=true`) — backend hard-fails to start if `JWT_SECRET` is default or shorter than 32 chars.
- **JWT** in `Authorization: Bearer <token>` header, access 15min / refresh 14d (rotated).
- **API keys** in `X-API-Key` header, role-scoped, HMAC-SHA256 hashed, indexed for O(1) lookup.
- **SSE auth** via short-lived single-use tickets (`POST /api/auth/sse_ticket`) since EventSource cannot send headers.
- **Per-team event filters** applied uniformly to every data endpoint (list, stats, globe, dashboard, intel, export, SSE).
- **Tool permission enforcement** — when an agent invokes a tool, the caller's role must hold the tool's declared permission. Prevents privilege escalation via agents.
- **CSV injection** blocked: cells starting with `= / + / - / @ / \t / \r / \n` are prefixed with `'`.
- **SSRF guard** rejects webhooks to private / loopback / link-local / multicast / reserved addresses.

---

## Roadmap

- ✅ MFA + refresh rotation + OIDC SSO
- ✅ Per-team scoping on every endpoint
- ✅ APScheduler for `on_critical` and `scheduled` agent triggers
- ✅ Self-service password reset
- ✅ Active sessions / devices
- ⏳ Cookie-based session with `HttpOnly` (today JWT is in localStorage, mitigated by tight CSP)
- ⏳ SAML (OIDC covers 90% of corporate SSO today)
- ⏳ Alembic migrations
- ⏳ Postgres + encryption at rest
- ⏳ Multi-replica (today rate limit / lockout / SSE tickets are in-memory; needs Redis)

---

## Built with

[Claude Code](https://docs.claude.com/en/docs/claude-code) — 2 days, mostly during weekend evenings.

## License

MIT. See [LICENSE](LICENSE).
