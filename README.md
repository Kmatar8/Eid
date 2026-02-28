# Hroof

Realtime party-game platform (host TV + mobile controllers) built with Next.js and Cloudflare.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Live Testing Surfaces

After deployment, use these routes:

1. `/host` for host login, room creation, and game actions.
2. `/join/<roomId>` for player registration.
3. `/controller/<roomId>` for player controller + answer submission.
4. `/room/<roomId>` for TV/host display view.

Host credentials are seeded from:

1. `HROOF_HOST_CREDENTIALS_JSON` (if provided), else
2. `lib/server/host-credentials.generated.json` (generated from CSV).

Regenerate credential pool (500 rows by default):

```bash
npm run seed:redeem-codes -- 500 docs/seeds/host-redeem-codes.csv 12 12 lib/server/host-credentials.generated.json
```

CSV format is `code,password` and login uses `code` as username.

## Deployed Smoke Test

Run the API-level smoke script against your deployed domain:

```bash
BASE_URL=https://<your-deployed-domain> scripts/smoke-live.sh
```

Optional env vars:

- `HOST_USER` (optional; defaults to first CSV row username when available)
- `HOST_PASS` (optional; defaults to first CSV row password when available)
- `HOST_CREDENTIALS_CSV` (optional; defaults to `docs/seeds/host-redeem-codes.csv`)

The script validates login, room creation, join flow, host lifecycle actions, responder answer submission, reconnect, and session end behavior.

## 100-Room Load Canary

Run the constrained load profile (capped to 100 rooms):

```bash
BASE_URL=https://<your-deployed-domain> npm run load:rooms-100
```

Important notes:

- The script requires one unique host credential per concurrently active room.
- Provide credential pool via `HOST_CREDENTIALS_JSON`:
  - `HOST_CREDENTIALS_JSON='[{"username":"host-1","password":"..."} ... ]'`
- Defaults are `LOAD_ROOMS=100` and `PLAYERS_PER_ROOM=20`.
- The script outputs p50/p95/p99 latency for login, create, joins, host actions, state reads, and end-session.

## Build and Deploy

```bash
npm run lint
npm run build
npm run deploy
```
