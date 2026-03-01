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

Generate host credential pool (500 rows by default):

```bash
npm run seed:redeem-codes -- 500 docs/seeds/host-redeem-codes.csv 12 lib/server/host-credentials.generated.json
```

Sync generated codes to D1 (placeholder hashes are inserted until first activation):

```bash
# remote D1
npm run sync:host-codes:d1 -- docs/seeds/host-redeem-codes.csv --remote
```

CSV format is `code` only. First-time host login must activate the code by setting a password.
Credential tracking is stored in `host_access_codes` (D1):
- `active` before first login
- `redeemed` after first successful login
- `expired` after access expiry

Access window is `60 days` from first successful activation.

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

## Landing Chatbot (Gemini + Markdown KB)

The landing page includes an Arabic support chatbot backed by:

- API route: `/api/chat/support`
- Gemini model: `gemini-2.5-flash` (default)
- Server env var: `HROOF_GEMINI_API_KEY`

Editable chatbot content lives in:

- `public/chatbot/knowledge-base.md`
- `public/chatbot/system-instructions.md`
- `public/chatbot/fallback-message.md`

Update flow:

1. Edit files in `public/chatbot/`.
2. Local `npm run dev`: changes apply to new chat requests immediately.
3. Deployed environment: push changes and run `npm run deploy`.
