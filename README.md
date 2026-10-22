# Eid | ألعاب العيد
### A shared screen. A room full of players. Everyone’s phone is a controller.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Eid is an Arabic party-game platform for gatherings, built around a host display and mobile controllers. The codebase uses the internal name **Hroof** (`hroof-app`).

Hosts create rooms and guide play; players join from their phones. The project includes trivia, a Jeopardy-style board, Haraj gameplay, team management, scoring, reconnect support, and an Arabic support chatbot.

## How it works

| Surface | Route | Purpose |
| --- | --- | --- |
| Host | `/host` | Sign in, create a room, manage teams and run games |
| Join | `/join/<roomId>` | Register a player |
| Controller | `/controller/<roomId>` | Send player input and answers |
| Shared display | `/room/<roomId>` | Show the room on a TV or shared screen |

## Built with

- **Next.js 16, React 19 and TypeScript** for the application.
- **Tailwind CSS 4, Radix UI and Motion** for the interface.
- **Cloudflare Workers and OpenNext** for the deployed application.
- **Durable Objects** for room state and **D1** for persistent data.
- **Gemini** for the optional landing-page support chatbot.

## Get started

Use a Node.js version supported by the pinned Next.js and Wrangler packages, plus npm.

```bash
git clone https://github.com/Kmatar8/Eid.git
cd Eid
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000).

**The development server alone does not provision the full multiplayer backend.** Host login requires D1; deployed room services require the Cloudflare bindings described below. Provision your own resources and generate your own host codes.

## Configure your own backend

The existing deployment targets Cloudflare. Review these files before deploying:

| File | Responsibility |
| --- | --- |
| `wrangler.jsonc` | Main application, D1, queue producer and room service bindings |
| `workers/room-do/wrangler.jsonc` | Room Durable Object worker |
| `workers/activity-cron/wrangler.toml` | Activity monitoring worker |
| `migrations/` | D1 schema migrations |
| `open-next.config.ts` | OpenNext configuration |

Replace the checked-in Cloudflare account/database identifiers with your own. Create the D1 database and queue referenced by the configuration, apply the migrations to your database, and configure the room worker. R2 bindings are currently commented out.

Keep runtime secrets in local environment files or Cloudflare secrets, never in Git. Inspect the server code for the configuration needed by the features you enable.

### Host access codes

Hosts sign in with an access code. Access lasts **60 days from first successful login**, and a new login rotates the active session.

Generate a private credential pool:

```bash
npm run seed:redeem-codes -- 500 docs/seeds/host-redeem-codes.csv 12 lib/server/host-credentials.generated.json
```

After configuring your own D1 database, synchronize the codes:

```bash
npm run sync:host-codes:d1 -- docs/seeds/host-redeem-codes.csv --remote
```

The CSV contains a `code` column. Treat both generated files as credentials. Never reuse codes from repository history or publish generated exports.

### Optional support chatbot

Set the server-side `HROOF_GEMINI_API_KEY` secret to enable Gemini integration. The default model is `gemini-2.5-flash`.

Edit the chatbot’s knowledge and tone in `public/chatbot/`:

- `knowledge-base.md`
- `system-instructions.md`
- `fallback-message.md`
- `social-intents.md`

These files are public assets: keep private information out of them. Redeploy after changing production content.

## Validation and deployment

```bash
npm run lint
npx tsc --noEmit
npm run build
```

For an account you have configured:

```bash
npm run deploy
```

A retry helper is available for transient Cloudflare deployment failures:

```bash
npm run build:worker
npm run deploy:cf:retry -- --config wrangler.jsonc
```

Optional settings: `CF_DEPLOY_MAX_ATTEMPTS` (default 3) and `CF_DEPLOY_RETRY_DELAY_MS` (default 8000).

### Deployed smoke test

Run only against an environment you control:

```bash
BASE_URL=https://your-test-domain.example scripts/smoke-live.sh
```

The script exercises login, room creation, joining, host actions, answers, reconnect and session termination. Review `scripts/smoke-live.sh` for credential inputs.

### Load canary

```bash
BASE_URL=https://your-test-domain.example npm run load:rooms-100
```

The default profile uses 100 rooms and 20 players per room. Supply one unique host credential per active room through `HOST_CREDENTIALS_JSON`. Run against a dedicated test environment and account for service costs.

## Repository guide

```text
app/          Pages and API routes
components/   Shared interface components
lib/client/   Client API and session helpers
lib/server/   Authentication, game content and room persistence
workers/      Room and monitoring workers
migrations/   D1 database migrations
scripts/      Credentials, assets, smoke tests and load tools
public/       Images, sounds and chatbot content
docs/         Milestone tracking and implementation tasks
```

## Contributing

Bug reports and focused improvements are welcome. Include reproduction steps, expected behavior and relevant logs with secrets removed.

Read [AGENTS.md](AGENTS.md) for the task and branch workflow, and [PRD.md](PRD.md) for product requirements. Document changes in `docs/tasks/` and run the relevant checks before submitting a contribution.

## License

The project’s original code is available under the [MIT License](LICENSE), permitting commercial use, modification and redistribution subject to its terms.

Third-party dependencies and assets remain subject to their respective licenses. The project license does not grant rights to third-party brands or trademarks.
