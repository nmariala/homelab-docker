# Homelab Docker (staging + CI/CD)

Docker staging environment dan CI/CD foundation untuk **Homelab Server Management Dashboard** (project belajar/homelab, bukan project Stock SDI production).

## Architecture

```
Internet ─► Cloudflare Tunnel
                    │
                    ▼
            Nginx :80 (production native)
              ├── frontend build → /var/www/homelab-dashboard
              └── /api/ → Node native 127.0.0.1:3000 (belajar-node)
                                 └── PostgreSQL native 127.0.0.1:5432

Docker staging (paralel, bukan production):
  homelab-api      : 127.0.0.1:3001 (localhost-only, tidak dipublish ke internet)
  homelab-postgres : network bridge privat homelab_int (TIDAK dipublish ke host)
```

Production tetap **native** (systemd `belajar-node`, PostgreSQL native, Nginx, Cloudflare Tunnel).

## Repository layout

```
homelab-docker/
├── backend/             # source API (salinan yang divalidasi CI & dipakai build Docker staging)
│   ├── Dockerfile
│   ├── server.js
│   ├── db.js
│   ├── auth.js
│   ├── package.json
│   ├── package-lock.json
│   └── .dockerignore
├── .github/workflows/ci.yml
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

Catatan: source backend production asli berada di `/home/nugie/belajar-node` (native). Salinan di `backend/` dipakai untuk build image Docker staging dan divalidasi CI. Jangan menganggap salinan sebagai satu-satunya source — sinkronisasi dilakukan manual.

## Local development (native)

Backend: `/home/nugie/belajar-node` (jam server.js dengan `node server.js`, systemd `belajar-node`).
Frontend: `/home/nugie/homelab-dashboard` (Vite dev/build hanya manual, bukan service).

## Docker staging

```bash
cd /home/nugie/homelab-docker
cp .env.example .env.docker   # lalu isi nilai acak (JANGAN commit)
sudo docker compose up -d     # postgres + api
sudo docker compose ps
curl http://127.0.0.1:3001/api/health
sudo docker compose down      # jangan pernah `down -v` (menghapus volume)
```

## CI/CD

```
Developer
→ Git commit
→ GitHub
→ GitHub Actions (runner GitHub-hosted)
→ install dependencies (npm ci)
→ backend validation (node --check)
→ backend smoke health (/api/health, short-lived, tanpa DB)
→ Docker configuration validation (docker compose config)
→ PASS/FAIL
```

CI **tidak terhubung** ke server production mana pun (PostgreSQL production, API, Cloudflare, Tailscale, Proxmox, Samba) dan **tidak melakukan auto-deploy**. CI hanya memvalidasi source dalam repository.

## Environment variables (placeholder)

Lihat `.env.example`. Semua nilai di sana placeholder (`change-me`). Jangan pernah menaruh credential asli di `.env.example`.

## Security notes

- JANGAN commit `.env`, `.env.docker`, backup, *.sql/*.sql.gz, *.pem/*.key, atau credential apa pun.
- Secret di CI tidak dipakai; tidak ada GitHub Actions secret yang diperlukan saat ini.
- Production deployment masih **manual**; rollback = restore service systemd / config backup (lihat TAHAP 11).

## Deploy / Rollback

Tidak ada otomatisasi deploy. Untuk mengubah production: lakukan manual pada `/home/nugie/belajar-node` + restart `belajar-node` (systemd) + `nginx -t && systemctl reload nginx`. Rollback = pulihkan file/config dari backup (`homelab-backup`, `/data/backup`, `security-backup-*`).