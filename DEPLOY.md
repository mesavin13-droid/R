# ROADLIVE Deployment

One Node process serves the SPA, the REST API and the chat WebSocket on a single
port. `Dockerfile` builds it in two stages so the Vite toolchain never ships.

## Build

```bash
docker build -t roadlive .
docker run --rm -p 8000:8000 --env-file .env roadlive
```

Local run without Docker:

```bash
npm ci
npm run dev          # tsx + Vite middleware, hot reload
npm run build:all    # vite build -> dist/, esbuild -> server-dist/
npm run start:prod   # node server-dist/server.js, NODE_ENV=production
```

## Vercel (current production)

```bash
vercel link --project roadlive --yes
vercel env add SUPABASE_URL production          # repeat per variable, then preview
vercel --prod                                   # https://roadlive.vercel.app
```

Layout: `vercel.json` runs `npm run vercel:build` (Vite → `dist/` for the CDN, esbuild →
`server-dist/` for the function), serves `dist/` as static output, and rewrites
`/api/:path*` and `/health` onto `api/index.js`, which re-exports the Express app.
The rewrite keeps the original request path, so every Express route works unchanged.

Variables are set per environment (`production` and `preview`). Vercel forces an
explicit type for `VITE_` keys: `--type config` for the public ones
(`VITE_SUPABASE_ANON_KEY`, `VITE_YANDEX_MAPS_API_KEY`, `VITE_VAPID_PUBLIC_KEY`),
default secret for the rest. Never set `REDIS_URL` here.

Vercel-specific limits:

- **No WebSocket.** `/ws/chat` never connects; `ChatService` falls back to
  `POST /api/chat/messages` and backs off (3s → 60s) instead of retrying every 3s.
- **Rate limiting is in-process** and resets with each cold start, so it is a
  soft guard only.
- **Push subscriptions** are loaded lazily from Supabase on the first push request
  per instance; `startServer()` does not run here.

## Platform settings

| Setting | Value |
|---|---|
| Port | `8000` (the server reads `PORT`; platforms inject it) |
| Health check path | `/health` |
| Regions | `fra` (Frankfurt) or `us-wash` — the free instance is only offered in these two |
| Instance | `nano` / free, 512MB RAM, 0.1 vCPU |

## Koyeb

Free-tier caveat: the free Instance is only granted to accounts created **before
17 February 2026**. New signups start on Pro at $29/month with a card hold on file.
If the free Instance is unavailable, `Dockerfile` is unchanged and works on Render,
Railway, Fly.io, Dokploy or any VPS.

1. Push this repository to GitHub.
2. Koyeb dashboard → **Create → Web Service → Docker**.
3. Repository: your fork, branch `main` (or the deploy branch).
4. Build settings: leave the Dockerfile autodetected, context `/`, no build command.
5. Runtime: port `8000`, health check `/health`.
6. Add every variable from `.env.example` under **Environment variables**, marking
   the server-only ones as secrets.
7. After the first deploy, set `APP_URL` to the assigned domain
   (`https://<service>.koyeb.app`) and redeploy.
8. Point the Telegram Mini App at that URL via BotFather.

Required, or the app refuses to start / stays locked:

- `TELEGRAM_BOT_TOKEN` — the server validates `initData` with it
- `ROADLIVE_ADMIN_TELEGRAM_IDS` — owner Telegram id
- `SUPABASE_SERVICE_ROLE_KEY` — all database access goes through the server
- `VAPID_PRIVATE_KEY` + `VITE_VAPID_PUBLIC_KEY` — Web Push

## Scaling notes

- **0.1 vCPU** is the real constraint of the free instance. Node plus the Supabase
  client will run, but expect slow cold starts. The WebSocket chat holds a
  connection per open client and is the first thing to degrade under load.
- **Rate limiting** falls back to an in-process counter when `REDIS_URL` is empty.
  That is fine for one instance and wrong for two, so keep the service at a single
  instance unless a Redis instance is configured.
- **Web Push** delivery happens inside the running process. If the instance scales
  to zero, a push is sent only after the platform wakes the service. Configure a
  minimum of one instance, or an uptime ping, if timely alerts matter.
- **In-memory caches** (staff roles, city/district slugs, ad payloads) are
  per-instance and reset on deploy. This is intentional: reloading is cheap.

## After the first deploy

1. `/health` returns `{"ok":true,...}`.
2. `GET /api/ads` returns campaigns; `GET /api/admin/ads` must return `401` without
   a Telegram session — if it does not, the deployment is serving something else.
3. Open the Mini App in Telegram and confirm that `/api/auth/me` reports the owner
   role for the id in `ROADLIVE_ADMIN_TELEGRAM_IDS`.
