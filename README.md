# Homelab Server Management Dashboard

A self-hosted dashboard that combines an inventory system with live server monitoring, running on a personal homelab.

## Overview

This is a personal homelab project. The dashboard solves two small problems I ran into at home:

1. **Inventory management.** I wanted a simple way to track items (`barang`), warehouses, and stock in/out transactions (`MASUK`/`KELUAR`) in PostgreSQL — without paying for or depending on a SaaS tool.
2. **Server monitoring.** I wanted one page to check how the homelab VM is doing (CPU, memory, disk, load) and whether the core services are running — instead of SSH-ing in and running commands each time.

The result is a small, self-contained web application: a React dashboard in front of a Node.js REST API backed by PostgreSQL, exposed to the internet through Nginx and a Cloudflare Tunnel, and guarded by the usual security hardening you would do on a Linux server. It is a learning project as much as a useful tool, and it is genuinely deployed and running.

## Live Demo

- Dashboard: **https://server.stock-sdi.my.id**

The dashboard runs on my own homelab (a single small VM at home) and is reachable publicly through Cloudflare. The frontend talks to the API on the same origin (`https://server.stock-sdi.my.id/api/*`), so there is no CORS and a single entrypoint.

I do not publish login credentials here.

## Architecture

```
Internet
   │
   ▼
Cloudflare (DNS + CDN)
   │
   ▼
Cloudflare Tunnel
   │
   ▼
Nginx :80
   ├── /        → React production build (static files)
   └── /api/*   → Node.js API  → 127.0.0.1:3000
                          │
                          ▼
                       PostgreSQL
                       (127.0.0.1:5432)
```

A single public hostname (`server.stock-sdi.my.id`) is used for both the dashboard and the API (same-origin). An earlier second hostname (`api.stock-sdi.my.id`) that pointed at the same nginx was retired — there is no separate API host.

## Features

**Dashboard (frontend)**
- Login/logout with a session cookie
- Live system overview: hostname, CPU model & usage, memory, disk usage (`/` and `/data`), load average, uptime, last-updated timestamp
- Service status panel for the Stack: Node.js API, PostgreSQL, Nginx, Samba, Cloudflare Tunnel, Tailscale
- Auto-refresh with a manual retry button

**REST API (Node.js)**
- Inventory CRUD for items (`GET/POST/PATCH/DELETE /api/barang`)
- Stock transactions (`POST /api/transaksi`) with validation of master records and stock-level updates inside a database transaction
- `GET /api/health` — public health check (no login)
- `GET /api/system` — protected system metrics
- `GET /api/services` — protected service status
- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`

**Database (PostgreSQL)**
- Tables for items, warehouses, criteria, transactions, and stock levels
- Transaction processing uses PostgreSQL transactions and row locking, with application-level validation of master data and stock constraints.

**Authentication**
- HttpOnly session cookie (`hl_session`) with `SameSite=Lax`, optional `Secure` flag
- 8-hour session expiry, constant-time credential comparison
- In-memory failed-login rate limiting (5 failures / 5 minutes / IP)

**Infrastructure**
- Nginx reverse proxy: static frontend + `/api/*` → Node.js on loopback
- Cloudflare Tunnel for public HTTPS with a single hostname
- systemd for the Node.js API
- Tailscale for private network access, Samba for LAN file sharing

**Backup**
- Scheduled backups of PostgreSQL plus configuration files
- Retention of the 7 newest backups per category (systemd timer)
- Restore and failure testing performed

**Docker**
- Docker Compose staging stack: API + PostgreSQL 17 on Alpine
- Internal Docker network, memory limits, non-root container user, capability restrictions, healthchecks
- API published only to `127.0.0.1:3001` (loopback); PostgreSQL not published to the host

**Security**
- UFW firewall with default-deny incoming
- SSH hardening (root login disabled, limited authentication attempts, X11 forwarding disabled)
- Password auth still enabled as a known trade-off (see Current Limitations)
- Nginx security headers, dotfile access blocking, `server_tokens off`
- Environment values kept out of Git (`.env*` ignored, `.env.example` used as a tracked template)
- systemd and Docker hardening (`NoNewPrivileges`, capability drops)

**CI/CD**
- GitHub Actions workflow that validates every push to `main`
- `npm ci`, `node --check`, backend smoke health check, `docker compose config` validation
- A secret-track guard that fails the build if secret-looking files are committed

## Technology Stack

**Frontend**
- React (Vite build, static files served by Nginx)
- Plain CSS, no UI framework

**Backend**
- Node.js 20
- Built with the core `http` module (no Express)
- `pg` for PostgreSQL access, `dotenv` for configuration

**Database**
- PostgreSQL (native service on the production VM; PostgreSQL 17 Alpine in the Docker staging stack)

**Infrastructure**
- Debian Linux VM
- Nginx
- Cloudflare Tunnel (`cloudflared`)
- systemd
- Tailscale, Samba

**Security**
- UFW
- OpenSSH (hardened)
- Nginx security headers

**DevOps**
- Git + GitHub
- GitHub Actions (GitHub-hosted runners)
- Docker Engine + Docker Compose

## Security

The measures below are actually applied and were verified as part of the setup:

- **Dashboard authentication**: sessions are stored in an HttpOnly cookie (`SameSite=Lax`, optional `Secure`, 8h expiry). Failed logins are rate-limited per IP; credentials are compared with a constant-time comparison.
- **Protected endpoints**: `/api/system` and `/api/services` require a valid session (401 without one). `/api/health` is intentionally public so simple health checks work without login.
- **Firewall**: UFW default-deny incoming; only the ports that must be reachable are allowed (SSH from trusted networks, web on 80 for the tunnel, tunnel/tailscale traffic).
- **SSH hardening**: root login disabled, limited authentication attempts, and X11 forwarding disabled. TCP forwarding is intentionally kept enabled (`AllowTcpForwarding yes`) because development tooling (OpenCode/Vite) relies on SSH tunnels.
- **Nginx**: security headers (nosniff, `X-Frame-Options`, Referrer-Policy), `server_tokens off` (no version banner), and dotfile access blocked (403). Static build served from `/var/www`.
- **Secrets**: environment files are ignored by Git (`.env`, `.env.docker`); only `.env.example` with placeholder values is tracked. Sensitive files are chmod 600.
- **systemd / Docker**: the Node.js service runs with `NoNewPrivileges`; Docker containers use `no-new-privileges`, drop Linux capabilities, run as a non-root user, and are kept in a private Docker network.
- **PostgreSQL**: binds to localhost only, not exposed outside the machine.

No credentials, tokens, private keys, or session secrets are stored in this repository.

## Backup & Recovery

A systemd timer runs a backup script that dumps PostgreSQL and copies configuration files (Nginx, Cloudflare Tunnel, systemd, Samba, application). It keeps the 7 newest backups per category.

Recovery was tested for real: a production backup was restored into the Docker staging PostgreSQL instance, the API came up, and the data (items, warehouses, criteria, transactions) was readable. The failure path (an own `down` of services) has also been exercised.

An honest caveat: the backups live on the same physical machine (same disk) as production. That protects against accidental data/configuration loss, but not against a full disk or host failure. Off-machine backup is not in place yet.

## Docker Staging

Docker is used here as a staging/containerization environment, not as a production cutover.

On the same VM there are two environments running side by side:

- **Production (native)**: Node.js under systemd, Nginx, native PostgreSQL.
- **Staging (Docker)**: an API container and a PostgreSQL 17 container in a private Docker network (`homelab_int`). The API is published only to `127.0.0.1:3001` (loopback), and PostgreSQL is not published to the host at all.

The staging stack exists to prove the Docker/Compose setup works end to end (restore a backup, run the API, hit the endpoints) without ever touching the live production services. The production deployment intentionally stays native.

```
docker compose up -d
curl http://127.0.0.1:3001/api/health
```

The stack is `postgres:17-alpine` with a named volume, plus an API image built multi-stage from `backend/` (non-root user, healthcheck).

## CI/CD

**GitHub Actions** validates the repository on every push/PR to `main`:

```
Push → GitHub Actions (GitHub-hosted runner)
        ├─ npm ci (backend/)
        ├─ node --check (syntax)
        ├─ backend smoke health check (short-lived server, no DB)
        ├─ docker compose config --quiet
        └─ secret-track guard
             → PASS / FAIL
```

- `npm ci` and the syntax checks run against the real `backend/package.json` / sources.
- The smoke check boots the API briefly and verifies `/api/health` responds, using dummy env values (no database contact).
- Docker Compose is validated by rendering the actual config and using `docker compose config --quiet`.
- The **secret-track guard** fails the build if files that look like secrets (`.env` variants, `.pem`/`.key`, SQL dumps, credentials) are ever tracked. `.env.example` is explicitly allowed as the configuration template.

CI is **validation only**. This workflow does not build production artifacts and does not deploy anything. There is no automatic production deployment anywhere in this project.

## Deployment

Production deployment is deliberately manual and controlled:

```
GitHub push
   │
   ▼
GitHub Actions (validation: PASS/FAIL)
   │
   ▼
[manual step on the VM: update backend source & refresh frontend build]
   │
   ▼
systemd restart + nginx -t → reload
```

GitHub Actions in this repository only validates code; it never touches the production server, the tunnel, or the database. Deployment to production is always a manual step performed on the VM: backend runtime files are updated on the server (the source mirrored in this repository is validated by CI, but production does not automatically pull from it), the frontend is built from its own source and served as static files from `/var/www/homelab-dashboard` (it does not come from this repository), and services are restarted after `nginx -t`. Infrastructure changes stay auditable and reversible because configuration backups are part of the backup routine.

## Project Structure

```
homelab-docker/
├── .github/
│   └── workflows/
│       └── ci.yml            # GitHub Actions validation pipeline
├── backend/                   # Node.js API source (validated by CI, used for Docker build)
│   ├── auth.js                # sessions, cookies, rate limiting
│   ├── db.js                  # PostgreSQL connection pool
│   ├── server.js              # HTTP API (barang, transaksi, system, services, auth, health)
│   ├── package.json
│   ├── package-lock.json
│   ├── Dockerfile             # multi-stage image, non-root user
│   └── .dockerignore
├── docker-compose.yml         # staging stack (API + PostgreSQL 17 + private network)
├── .env.example               # tracked template; safe placeholder values only
├── .gitignore
└── README.md
```

Note: the frontend production build (a Vite React app) lives on the server at `/var/www/homelab-dashboard` and is served as static files by Nginx; the frontend source is kept outside this repository.

## Engineering Challenges

Some problems that were actually encountered and solved during this project:

- **Reverse proxy routing with a single hostname.** Nginx serves the React build at `/` and proxies `/api/*` to the Node.js service on loopback. Because the frontend talks to the API same-origin (`/api/...`), there are no CORS issues and no separate API domain. A second hostname that had pointed at the same Nginx was mapped and then removed once the single-hostname setup was confirmed.
- **Authentication for a small Node service.** Sessions as HttpOnly cookies with expiry, constant-time credential checks, and failed-login rate limiting — implemented with the standard library rather than adding a framework.
- **Cloudflare Tunnel configuration.** Pointing one tunnel at Nginx with a catch-all 404, and cleaning up retired hostnames in the ingress config (verified via live DNS checks that the old hostname returns NXDOMAIN).
- **Running a Docker staging stack in parallel with native production.** Both environments share one small VM. Ports were kept on loopback, PostgreSQL was not published, capabilities were dropped, and a real production backup was restored into staging to prove the Compose stack.
- **Security hardening on a small budget.** UFW default-deny, SSH drop-in hardening, Nginx headers and dotfile blocking, systemd and Docker restrictions — while keeping the server usable and avoiding lockout (see Current Limitations).
- **A CI secret guard that was too aggressive.** The first guard regex treated `.env.example` (a legitimately tracked template) as a secret and failed the pipeline. It was fixed by explicitly excluding the template while still failing on real env files, dumps, keys, and credentials.
- **Node 20 action deprecation in CI.** Older GitHub Actions ran on a deprecated Node runtime; the actions were upgraded to versions that run natively on Node 24 while keeping the application's Node 20 runtime for validation.

## Lessons Learned

- Same-origin routing (`/api/*` behind the same host as the frontend) removes a whole class of CORS and cookie problems.
- Session hygiene matters even for personal tools: HttpOnly + SameSite + expiry + rate limiting are cheap to build and worth it.
- Docker's security defaults (`no-new-privileges`, capability drops, non-root users, private networks, memory limits) are straightforward to apply and make a real difference on a small box.
- Hardening a Linux server is a continuous trade-off (e.g., SSH password auth still enabled); documenting those trade-offs is as important as the hardening itself.
- CI/CD doesn't have to mean auto-deploy. Validation-only CI is a reasonable and safe starting point, and a secret guard adds real protection against leaking files.
- Infrastructure honesty: documenting limitations (single VM, same-disk backups) deliberately, rather than letting a portfolio over-claim.

## Current Limitations

These are the current, real constraints of the project:

- **Single VM with modest hardware** — one VM with limited RAM; not a multi-server or clustered setup. No high availability, no zero-downtime deployment.
- **Backups on the same disk** as production — protects against accidental loss, not hardware failure. Off-machine backups are not implemented yet.
- **No automated production deployment** — CI validates only; deploying to production is a manual step.
- **SSH password authentication is still enabled** — no SSH keys are installed for the user account yet, so password auth was kept to avoid lockout. This is a documented remaining risk.
- **No external alerting/monitoring** — the dashboard shows live status, but there is no external pager/alert service.
- **In-memory sessions and rate limits** — they live in memory, so a Node.js restart clears active sessions and rate-limit counters.
- **Not every API endpoint is session-gated** — authentication protects the monitoring endpoints and the dashboard UI; the inventory CRUD endpoints are not individually gated per request.

## Project Status

The project is **running in production** on my homelab (native stack: systemd + Nginx + PostgreSQL + Cloudflare Tunnel) and is reachable at https://server.stock-sdi.my.id. The Docker staging environment is validated and working, and the GitHub Actions CI pipeline is green on the default branch. It is a living project: features are added and hardening is iterated on as I learn.