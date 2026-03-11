# Running & Testing the Issue Autopilot Dashboard

## Overview
The dashboard is a standalone React + Vite app (`dashboard/dashboard-ui/`) backed by a Directus CMS (`dashboard/docker-compose.yml`) and an Express API server (`dashboard/api-server/`) that proxies Devin API calls.

## Secrets Needed
- `GITHUB_API_TOKEN` — GitHub PAT for seeding issues from `directus/directus` (public repo read access). Without this, the seed script uses unauthenticated API calls (60 req/hr limit which may be exhausted).
- `DEVIN_API_KEY` — Devin API key (from https://app.devin.ai/settings/api-keys) for the "Hand off to Devin" feature. Without this, the API server won't start.

## Full Setup (5 steps)

### 1. Start Directus + PostgreSQL
```bash
cd dashboard && docker compose up -d
```
Wait ~30s for Directus to initialize:
```bash
for i in $(seq 1 30); do
  curl -s -o /dev/null -w "%{http_code}" http://localhost:8055/server/health | grep -q "200" && echo "Ready" && break
  sleep 2
done
```
Admin UI: http://localhost:8055 (admin@example.com / admin123)

### 2. Bootstrap schema + seed data
```bash
cd dashboard && npm install && npm run bootstrap && GITHUB_TOKEN=$GITHUB_API_TOKEN npm run seed
```
This creates 3 collections (issues, devin_runs, activity_log) and seeds 50 issues, 12 devin_runs, ~57 activity_log entries.

### 3. Start the API server
```bash
cd dashboard/api-server && npm install
echo "DEVIN_API_KEY=$DEVIN_API_KEY" > .env
npm start
```
The API server runs on http://localhost:3001. It proxies Devin API calls and writes records to Directus.

### 4. Start the frontend dev server
In a separate terminal:
```bash
cd dashboard/dashboard-ui && npm install && npm run dev
```
The dashboard is served at http://localhost:5173. The Vite dev proxy forwards `/api/*` requests to the API server on port 3001.

### 5. Open the dashboard
Navigate to http://localhost:5173 in the browser.

## Key Features to Test

### KPI Cards (top row)
- 6 metric cards: Total Issues, In Progress, PRs Open, Merged, Escalated, Avg Age
- Clean white styling with slate borders

### Issues Table
- Full issue titles visible (no truncation)
- Sortable columns, status filter bar
- Clicking a row opens the detail panel on the right

### Issue Detail Panel (right side)
- Shows issue metadata, recommendation, labels, description
- **Unassigned issues** (unreviewed/candidate/approved with no Devin runs): Shows "Hand off to Devin" button
- **In-progress issues**: Shows "Devin Progress" timeline with activity log steps + "Open Devin Session" button

### Hand off to Devin (real API integration)
1. Click an unreviewed issue
2. Click "Hand off to Devin" button
3. Confirm the dialog
4. Button shows loading spinner ("Creating Devin session...")
5. A real Devin session is created via the API
6. New browser tab opens with the Devin session URL
7. Dashboard refreshes showing new devin_run record and activity_log entry
8. Issue status changes to "approved"

### Activity Feed
- Always visible at bottom of right column
- Shows recent autopilot events with icons and relative timestamps

## Lint and Build
```bash
cd dashboard/dashboard-ui && npm run lint && npm run build
```
TypeScript checking: `cd dashboard/dashboard-ui && npx tsc --noEmit`

## Key Technical Details

### Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (`dashboard/dashboard-ui/`)
- **API Server**: Express proxy (`dashboard/api-server/`) — keeps DEVIN_API_KEY server-side
- **Backend**: Directus CMS with PostgreSQL (`dashboard/docker-compose.yml`)
- **Vite Proxy**: Dev server forwards `/api/*` to Express on port 3001

### Directus v11.16+ Specifics
- **Policy-based permissions**: Public read permissions use `/policies` endpoint (not the old `role: null` approach)
- **Default integer PKs**: Auto-increment integers, NOT UUIDs. Foreign keys must use `type: 'integer'`
- **bigInteger for GitHub IDs**: GitHub IDs can exceed 32-bit range. Use `bigInteger` type.

### Port Usage
- 5432: PostgreSQL
- 8055: Directus
- 3001: Express API server
- 5173: Vite dev server

### CORS
The `docker-compose.yml` includes `CORS_ENABLED=true` and `CORS_ORIGIN=true`. If CORS errors appear, verify these env vars are present.

### Idempotency
- Bootstrap: re-running skips existing collections
- Seed: deletes existing issues then re-inserts fresh data

### Environment Variables
- `DIRECTUS_URL` (default: http://localhost:8055)
- `DIRECTUS_ADMIN_EMAIL` (default: admin@example.com)
- `DIRECTUS_ADMIN_PASSWORD` (default: admin123)
- `DIRECTUS_SECRET` (default: change-me-to-a-secure-random-value)
- `GITHUB_TOKEN` / `GITHUB_API_TOKEN` (for seed script)
- `DEVIN_API_KEY` (for API server)
- `API_PORT` (default: 3001)

## Cleanup
```bash
cd dashboard && docker compose down -v
```
