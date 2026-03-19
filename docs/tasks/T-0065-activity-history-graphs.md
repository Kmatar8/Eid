# T-0065: Activity Monitor Historical Graphs

## 1. Objective
Add historical graphs to the Activity Monitor page showing trends for the last 25 hours, 7 days, and 30 days for metrics like Hosts Present, Active Rooms, and Active Controllers.

## 2. Scope (in/out)
**In Scope:**
- D1 schema migration to store snapshots.
- API route to capture snapshots.
- API route to query historical snapshots.
- Cloudflare scheduled worker (CRON) to take snapshots every 15 minutes.
- Frontend React charts (Recharts) on the `/admin/activity` page.

**Out of Scope:**
- Exporting the historical data to CSV/external services.

## 3. Dependencies
- Cloudflare D1
- `recharts` for simple, accessible charting.

## 4. Implementation plan
1. Create a DB migration for `activity_snapshots` table. Update type bindings.
2. Develop `POST /api/admin/activity/snapshot` to fetch current runtime activity and save it to D1.
3. Develop `GET /api/admin/activity/history` to summarize those records for `24h`, `7d`, and `30d`.
4. Create a minimal Cloudflare worker under `workers/activity-cron/` that calls the snapshot endpoint on a cron schedule (`*/15 * * * *`).
5. Run the migration.
6. Build out the Recharts graphs in `app/admin/activity/page-client.tsx`.

## 5. Acceptance criteria
1. Admin can view line/area charts of activity on the dashboard.
2. The user can toggle between 24h, 7d, and 30d views.
3. Snapshots are stored durably in D1 automatically every 15 minutes.

## 6. Validation checklist
- [ ] Schema migrated properly locally and manually tested insertion.
- [ ] API endpoint correctly groups by time granularity (e.g. hourly average for 7d).
- [ ] Cron worker deploys and successfully pings `POST /api/admin/activity/snapshot`.
- [ ] Charts render properly and look premium.
