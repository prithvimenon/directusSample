# Testing: Issue Autopilot Dashboard

How to test the dashboard backend (Directus + PostgreSQL + seed scripts).

## Devin Secrets Needed

- `GITHUB_API_TOKEN` — GitHub PAT with public_repo read scope. Used as `GITHUB_TOKEN` when running the seed script. Without it, the unauthenticated GitHub API limit (60 req/hr) may be exhausted, especially on shared IPs.

## Prerequisites

- Docker and Docker Compose installed
- Node.js available
- Port 8055 free for Directus, port 5432 for PostgreSQL

## Setup Steps

1. **Start Docker stack**:
   ```bash
   cd dashboard && docker compose up -d
   ```
   Wait ~30s for Directus to initialize. Verify with:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:8055/server/health
   # Should return 200
   ```

2. **Install npm dependencies**:
   ```bash
   cd dashboard && npm install
   ```

3. **Run bootstrap** (creates collections + permissions, idempotent):
   ```bash
   npm run bootstrap
   ```
   Expected: Creates `issues`, `devin_runs`, `activity_log` collections.

4. **Run seed** (fetches GitHub issues + seeds demo data):
   ```bash
   GITHUB_TOKEN=$GITHUB_API_TOKEN npm run seed
   ```
   Expected output:
   - 50 issues fetched and inserted
   - 12 Devin runs created (mixed statuses)
   - ~57 activity log entries created

## Verification

### Admin UI
- Navigate to http://localhost:8055
- Login: `admin@example.com` / `admin123`
- First login may show a "Set Owner" dialog — click "Remind Later" to dismiss
- Left sidebar shows Content with 3 collections: Activity Log, Devin Runs, Issues
- Issues: should have 50 items with real GitHub titles from `directus/directus`
- Devin Runs: should have 12 items across statuses (merged, running, queued, pr_opened, failed, escalated)
- Activity Log: should have ~57 items with event types (issue_ingested, issue_approved, devin_started, pr_opened, pr_merged, escalated)

### Public API (no auth needed)
```bash
# Issues
curl http://localhost:8055/items/issues?limit=3

# Devin runs with linked issue titles
curl "http://localhost:8055/items/devin_runs?fields=*,issue.title"

# Recent activity
curl "http://localhost:8055/items/activity_log?sort=-timestamp&limit=5"
```

## Troubleshooting

- **GitHub API 403 (rate limit)**: The unauthenticated API has a 60 req/hr limit which may be exhausted on shared IPs. Always prefer using `GITHUB_TOKEN=$GITHUB_API_TOKEN` when running the seed. The seed only makes 1-2 API calls (50 issues/page, capped at 50), so a token with any permissions will work.
- **Seed fails with auth error**: Ensure Directus is fully initialized (wait 30s after `docker compose up -d`). Check `docker compose logs directus` for startup errors.
- **Collections already exist**: Bootstrap is idempotent — it skips existing collections. To fully reset: `docker compose down -v && docker compose up -d`, then re-run bootstrap + seed.
- **Devin runs / activity_log already seeded**: These functions check for existing records and skip if data exists. To re-seed, reset the database with `docker compose down -v`.

## Key Technical Details

- **Integer PKs**: Directus uses auto-increment integer primary keys. All FK references (issue, devin_run) are integers.
- **FK on delete**: `devin_runs.issue` and `activity_log.issue` use `ON DELETE SET NULL`, not CASCADE. Deleting issues won't cascade-delete runs/logs.
- **bigInteger for github_id**: The `github_id` field is `bigInteger` type. Coerce to Number when comparing.
- **GITHUB_TOKEN is optional**: The seed script logs a warning and proceeds with unauthenticated API calls if no token is set.
