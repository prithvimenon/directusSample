# Issue Autopilot — Dashboard Backend

Internal dashboard for managing a GitHub issue backlog with autonomous Devin execution.

## Architecture

- **Backend**: Directus (headless CMS) providing REST API + admin panel
- **Database**: PostgreSQL
- **Data**: Real GitHub issues from `directus/directus` + seeded Devin execution records

## Quick Start

### 1. Start the stack
```bash
cd dashboard
docker compose up -d
```

Wait ~30s for Directus to initialize. Admin panel: http://localhost:8055

### 2. Install dependencies
```bash
npm install
```

### 3. Bootstrap the schema
```bash
npm run bootstrap
```

Creates 3 collections: `issues`, `devin_runs`, `activity_log`

### 4. Seed data
```bash
GITHUB_TOKEN=ghp_your_token npm run seed
```

- Ingests 50 real open issues from `directus/directus`
- Seeds 12 Devin execution records (1 real merged, 1 in-progress, 10 synthetic)
- Generates ~70 activity log entries

### 5. Verify
- Visit http://localhost:8055
- Login: admin@example.com / admin123
- Browse the collections to see populated data

### Reset (if needed)
To start fresh (e.g., to replace mock data):
```bash
docker compose down -v && docker compose up -d
# Wait for Directus to initialize
npm run bootstrap
GITHUB_TOKEN=ghp_your_token npm run seed
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DIRECTUS_URL` | `http://localhost:8055` | Directus instance URL |
| `DIRECTUS_ADMIN_EMAIL` | `admin@example.com` | Admin email |
| `DIRECTUS_ADMIN_PASSWORD` | `admin123` | Admin password |
| `DIRECTUS_SECRET` | `change-me-to-a-secure-random-value` | Directus secret key |
| `GITHUB_TOKEN` | (required) | GitHub PAT with public_repo scope |

## Data Model

### `issues`
Real GitHub issues with computed heuristic fields: `is_stale`, `days_stale`, `recommended_action`, `complexity`, `confidence`, `status`

### `devin_runs`
Execution records linking Devin sessions to issues. Statuses: queued → running → pr_opened → merged / failed / escalated

### `activity_log`
Chronological event feed for async team awareness.

## API Access

All collections have public read access. Query examples:
```bash
# All issues, sorted by staleness
curl http://localhost:8055/items/issues?sort=-days_stale&limit=10

# Devin runs with linked issue data
curl "http://localhost:8055/items/devin_runs?fields=*,issue.title,issue.github_id"

# Recent activity
curl http://localhost:8055/items/activity_log?sort=-timestamp&limit=20
```

## Cleanup
```bash
docker compose down -v
```
