# Testing the Issue Autopilot Dashboard

## Devin Secrets Needed
- `GITHUB_API_TOKEN` — GitHub PAT for fetching issues from public repos (at least public_repo read scope)
- `DEVIN_API_KEY` — Devin API key for creating triage/fix sessions (get from https://app.devin.ai/settings/api-keys)

## Quick Start (5 Steps)

### 1. Start Docker (Directus + PostgreSQL)
```bash
cd dashboard && docker compose up -d
# Wait ~30s for Directus to be healthy
curl -s http://localhost:8055/server/health
```

### 2. Bootstrap Schema + Seed Issues
```bash
cd dashboard && npm install && npm run bootstrap && GITHUB_TOKEN=$GITHUB_API_TOKEN npm run seed
```
- Seeds 300 real issues from directus/directus via GitHub API
- Creates devin_runs (12 records) and activity_log (~57 entries)
- Bootstrap is idempotent — skips existing collections

**Important:** If new fields were added to an existing collection (e.g. triage fields on `issues`), the bootstrap script will skip the collection entirely since it already exists. You must add the new fields manually via the Directus API:
```bash
TOKEN=$(curl -s http://localhost:8055/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['access_token'])")

curl -X POST http://localhost:8055/fields/issues \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"field":"new_field_name","type":"text","schema":{"is_nullable":true}}'
```

### 3. Start API Server (port 3001)
```bash
cd dashboard/api-server && npm install && DEVIN_API_KEY=$DEVIN_API_KEY DIRECTUS_URL=http://localhost:8055 node server.mjs
```

### 4. Start Frontend (port 5173)
```bash
cd dashboard/dashboard-ui && npm install && npm run dev
```

### 5. Open Dashboard
Open http://localhost:5173 in the browser.

## Architecture
- **Directus** (localhost:8055): Data store with `issues`, `devin_runs`, `activity_log` collections
- **API Server** (localhost:3001): Express server that proxies Devin API calls (hand-off, triage)
- **Frontend** (localhost:5173): React + Vite dashboard UI

## Directus Admin Credentials
- URL: http://localhost:8055
- Email: admin@example.com
- Password: admin123

## Key UI Features to Test

### Issue Table
- 300 issues with status badges, complexity, confidence, recommendation columns
- Search/filter functionality
- Click issue row to open detail panel on the right (35% width)

### Issue Detail Panel
- Lifecycle stepper: Ingested -> Triaged -> Approved -> Devin Running -> PR Opened -> Merged
- "Why Devin" rationale section with contextual bullet points
- Recommendation labels: "Good Devin Candidate" or "Needs Scoping"
- "Hand off to Devin" button (creates real Devin session via API server)
- "View on GitHub" link

### AI Triage Analysis Section
Appears in the detail panel only when `triage_summary` is non-null for the issue. Shows:
- **Suggested Approach** — numbered step-by-step fix plan
- **Key Files** — monospace file paths from the repo
- **Risk Areas** — bullet points of concerns
- **Estimated Effort** — quick_fix (<1hr), moderate (1-4hrs), significant (4-8hrs), major (>8hrs)
- **View triage session** link

To test this, insert mock triage data via Directus API:
```bash
TOKEN=$(curl -s http://localhost:8055/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['access_token'])")

curl -X PATCH http://localhost:8055/items/issues/<ISSUE_ID> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "triage_summary": "Summary of the issue and fix approach.",
    "relevant_files": ["path/to/file1.ts", "path/to/file2.ts"],
    "suggested_approach": "1. Step one\n2. Step two\n3. Step three",
    "risk_areas": ["Risk area 1", "Risk area 2"],
    "estimated_effort": "moderate",
    "triage_session_id": "test-session-id",
    "triaged_at": "2026-01-01T00:00:00.000Z"
  }'
```
Then refresh the dashboard and click on that issue to see the triage section.

### Activity Feed
- Shows outcome-oriented messages ("Issue added to backlog", "Devin started implementation", etc.)
- Recent events displayed with timestamps

## Triage API Endpoints
- `POST /api/triage/analyze-issues` — creates Devin triage sessions (body: `{"limit": N}`)
- `POST /api/triage/store-result` — webhook to persist triage results from completed sessions

To test the triage API:
```bash
curl -X POST http://localhost:3001/api/triage/analyze-issues \
  -H "Content-Type: application/json" \
  -d '{"limit": 1}'
```
This will create a real Devin session and return its ID/URL.

## CLI Triage Script
```bash
cd dashboard && DEVIN_API_KEY=$DEVIN_API_KEY npm run analyze -- --limit 5
# Or for a specific issue:
DEVIN_API_KEY=$DEVIN_API_KEY npm run analyze -- --issue-id 42
# Force re-analyze already triaged issues:
DEVIN_API_KEY=$DEVIN_API_KEY npm run analyze -- --force
```

## Known Issues & Workarounds
- **`r.issue` null crash**: The `DevinRun.issue` field can be null when Directus returns null for the relation. Both `IssueDetailPanel.tsx` and `IssueDrawer.tsx` need null guards before accessing `r.issue.id`. This was fixed in PR #18.
- **Vite cache issues**: If styles don't render, try clearing the Vite cache: `rm -rf dashboard/dashboard-ui/node_modules/.vite && npm run dev`
- **CORS**: Docker compose must have `CORS_ENABLED: "true"` and `CORS_ORIGIN: "http://localhost:5173"` for the frontend to fetch from Directus.
- **Bootstrap skips existing collections**: New fields added to existing collections won't be created by bootstrap. Add them manually via the Directus fields API (see Step 2 above).

## Lint
```bash
cd ~/repos/directusSample && pnpm lint
```
Pre-existing lint warnings (no-console in server/CLI scripts, no-nested-ternary in pre-existing stepper code) are expected and not regressions.

## Environment Variables
| Variable | Where | Purpose |
|---|---|---|
| GITHUB_TOKEN / GITHUB_API_TOKEN | seed.mjs | Fetch issues from GitHub API (optional but recommended) |
| DEVIN_API_KEY | api-server, analyze-issues.mjs | Authenticate with Devin API |
| DIRECTUS_URL | api-server | Directus instance URL (default: http://localhost:8055) |
| DIRECTUS_ADMIN_EMAIL | bootstrap/seed | Admin email (default: admin@example.com) |
| DIRECTUS_ADMIN_PASSWORD | bootstrap/seed | Admin password (default: admin123) |
