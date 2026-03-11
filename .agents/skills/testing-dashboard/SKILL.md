# Testing the Issue Autopilot Dashboard

## Overview
The `dashboard/` directory contains a standalone Directus-based backend for the Issue Autopilot feature. It runs separately from the main Directus monorepo.

## Prerequisites
- Docker and Docker Compose installed
- Node.js 18+
- `GITHUB_TOKEN` env var (GitHub PAT with public repo read access) for real issue ingestion

## Setup Steps

### 1. Start Docker Stack
```bash
cd dashboard
docker compose up -d
```
Wait for Directus to be healthy:
```bash
for i in $(seq 1 30); do
  curl -s -o /dev/null -w "%{http_code}" http://localhost:8055/server/health | grep -q "200" && echo "Ready" && break
  sleep 2
done
```

### 2. Install Dependencies
```bash
cd dashboard && npm install
```

### 3. Run Bootstrap
```bash
node scripts/bootstrap-schema.mjs
```
Expected output: Creates 3 collections (issues, devin_runs, activity_log), sets public read permissions.

### 4. Run Seed (requires GITHUB_TOKEN)
```bash
GITHUB_TOKEN=ghp_xxx node scripts/seed.mjs
```
Expected: Fetches 300+ issues from directus/directus, computes heuristics, batch-inserts.

### 5. Verify in Admin UI
- Open http://localhost:8055
- Login: admin@example.com / admin123 (defaults, configurable via env vars)
- Check Issues collection has populated data
- Check Devin Runs and Activity Log are empty

## Key Technical Details

### Directus v11.16+ Specifics
- **Policy-based permissions**: Public read permissions use `/policies` endpoint to find the public policy (where `admin_access === false && app_access === false`), NOT the old `role: null` approach.
- **Default integer PKs**: Directus creates auto-increment integer primary keys by default, NOT UUIDs. Foreign key fields must use `type: 'integer'` to match.
- **bigInteger for GitHub IDs**: GitHub global node IDs can exceed 32-bit integer range. Use `bigInteger` type.

### Port Conflicts
- Dashboard Postgres runs on port 5432 — may conflict with root docker-compose if both are running
- Dashboard Directus runs on port 8055

### Testing Without GITHUB_TOKEN
GitHub API has a 60 req/hr unauthenticated rate limit. For testing the Directus insertion pipeline without a token, create mock issues and insert them directly via the Directus API.

### Idempotency
- Bootstrap is idempotent: re-running skips existing collections
- Seed is idempotent: deduplicates by `github_id`

### Environment Variables
- `DIRECTUS_URL` (default: http://localhost:8055)
- `DIRECTUS_ADMIN_EMAIL` (default: admin@example.com)
- `DIRECTUS_ADMIN_PASSWORD` (default: admin123)
- `DIRECTUS_SECRET` (default: change-me-to-a-secure-random-value)
- `GITHUB_TOKEN` (required for seed script)

## Cleanup
```bash
cd dashboard && docker compose down -v
```
