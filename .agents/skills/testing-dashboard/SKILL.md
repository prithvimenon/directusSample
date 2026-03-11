# Testing the Issue Autopilot Dashboard

## Overview
The dashboard is a standalone React + Vite app (`dashboard/dashboard-ui/`) that consumes data from a Directus backend (`dashboard/docker-compose.yml`).

## Devin Secrets Needed
- `GITHUB_API_TOKEN` — GitHub PAT for seeding issues from `directus/directus` (public repo read access). Without this, the seed script falls back to unauthenticated API calls (60 req/hr limit which may be exhausted).

## Local Testing Setup

### 1. Start Directus + PostgreSQL
```bash
cd dashboard && docker compose up -d
```
Wait ~30s for Directus to initialize. Verify at http://localhost:8055 (admin@example.com / admin123).

### 2. Bootstrap schema + seed data
```bash
cd dashboard && npm install && npm run bootstrap && GITHUB_TOKEN=$GITHUB_API_TOKEN npm run seed
```
This creates 3 collections (issues, devin_runs, activity_log) and seeds 50 issues, 12 devin_runs, 57 activity_log entries.

### 3. Build and serve the frontend
```bash
cd dashboard/dashboard-ui && npm install && npm run build && npx vite preview --port 4173
```
The production build is served at http://localhost:4173.

**Important:** Dev mode (`npm run dev`) may have Tailwind CSS rendering issues (raw @tailwind directives visible instead of compiled styles). This is a known Vite HMR/PostCSS caching issue. Always use the production build (`npm run build` + `npx vite preview`) for visual testing.

### 4. CORS
The `docker-compose.yml` includes `CORS_ENABLED=true` and `CORS_ORIGIN=*`. If CORS errors appear, verify these env vars are present.

## What to Test

### KPI Cards (top row)
- 6 metric cards: Total Issues, In Progress, PRs Open, Merged, Escalated, Avg Age
- Should show clean white styling with slate borders (no colorful gradients)

### Issues Table
- Full issue titles visible (no truncation)
- Sortable columns, status filter bar
- Clicking a row opens the detail panel on the right

### Issue Detail Panel (right side)
- Shows issue metadata, recommendation, labels, description
- Monochrome/neutral palette — color used only for status badges and functional indicators
- **Unassigned issues**: Shows "Hand off to Devin" button (currently a mock/confirm dialog)
- **In-progress issues**: Shows "Devin Progress" timeline with activity log steps + "Open Devin Session" button

### Activity Feed
- Always visible at bottom of right column
- Shows recent autopilot events with icons and relative timestamps

### Status Filters
Use the filter bar to test each status: unreviewed, candidate, approved, in_progress, pr_opened, merged, escalated

## Lint and Build
```bash
cd dashboard/dashboard-ui && npm run lint && npm run build
```
Also supports TypeScript checking: `npx tsc --noEmit`

## Teardown
```bash
cd dashboard && docker compose down -v
```
