# EntiaBot (Next.js)

Smart-home control dashboard for Entia (https://ape.entia.si/2/), rewritten in
Next.js 15 with TypeScript, Tailwind, and the App Router.

## Architecture

One Node process, boot order:

1. `server.ts` — custom Next.js server
2. `initEntia()` — logs into Entia, loads devices/jobs, starts the heartbeat loop,
   schedules sunrise/sunset + generic cron jobs
3. `attachWebSocketServer()` — WS endpoint at `/ws` for realtime device updates
4. Next.js HTTP handler — serves pages and API routes

```
src/
├── app/                     # App Router: pages + /api route handlers
│   ├── api/
│   │   ├── auth/{login,logout}/route.ts
│   │   ├── devices/route.ts
│   │   ├── set-device/[deviceId]/route.ts
│   │   └── set-custom-device/[customDeviceId]/route.ts
│   ├── login/page.tsx + LoginForm.tsx
│   ├── layout.tsx
│   ├── page.tsx             # dashboard (server component)
│   └── globals.css
├── components/              # Client components (Dashboard, cards, shade dialog)
├── lib/
│   ├── config.ts            # env-driven runtime config
│   ├── auth.ts              # JWT sign/verify + session helpers
│   ├── api-auth.ts          # JWT + X-API-Key dual-mode API auth
│   ├── types.ts             # shared domain types
│   ├── client/useEntiaWs.ts # React hook — WS client
│   ├── services/
│   │   ├── entia.ts         # singleton, heartbeat, scheduler
│   │   └── sunrise-sunset.ts
│   └── ws/server.ts         # WebSocket upgrade handler
├── middleware.ts            # auth gate for page routes
data/                        # devices.json, jobs.json, custom_devices.json
public/                      # images, sw.js, manifest
server.ts                    # custom Next.js server entry
```

## Development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Visits to `http://localhost:3000` redirect to `/login`.

## Production (Raspberry Pi / Ubuntu)

```bash
npm ci
npm run build
npm run start:prod   # NODE_ENV=production tsx server.ts
```

Or install as a systemd service — see `deploy/entiabot.service` and
`deploy/deploy.sh`.

## Authentication

- **Web UI:** JWT in a `jwt` cookie after `POST /api/auth/login`.
- **Homebridge / REST:** `X-API-Key` header matching `ENTIA_API_KEY`.

Tokens are **signed without an expiry** per product requirement. To revoke all
sessions, rotate `JWT_SECRET` in `.env.local` and restart the service — that
invalidates every issued token.

## REST API

```
GET  /api/devices                                 -> list devices
GET  /api/set-device/:deviceId?value=N            -> set device (auth required)
GET  /api/set-custom-device/:customDeviceId?value=N
GET  /set-device/:deviceId?value=N                -> legacy alias (rewrites to /api)
GET  /set-custom-device/:customDeviceId?value=N   -> legacy alias
```

## WebSocket

Connect to `/ws` with subprotocol `echo-protocol`.

```json
{ "type": "auth", "token": "<jwt-from-cookie>" }
{ "type": "refresh" }
{ "type": "setDevice", "deviceId": 123, "value": 50 }
{ "type": "setCustomDevice", "customDeviceId": 0 }
```

## Environment

See `.env.example` — all secrets (JWT, passwords, Entia creds, API key) come
from env vars; nothing is hardcoded.
