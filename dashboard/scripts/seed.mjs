/* eslint-disable no-console */
/**
 * Seed Script — GitHub Issue Ingest
 *
 * Fetches all open issues from directus/directus on GitHub, computes
 * heuristic fields, and writes them into the local Directus instance.
 * Idempotent — duplicates (by github_id) are skipped.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const ADMIN_EMAIL = process.env.DIRECTUS_ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.DIRECTUS_ADMIN_PASSWORD || 'admin123';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  console.error('GITHUB_TOKEN env var is required');
  process.exit(1);
}

const GITHUB_REPO = 'directus/directus';
const PER_PAGE = 100;
const BATCH_SIZE = 100;

// ── helpers ──────────────────────────────────────────────────────────────────

async function getAccessToken() {
  const res = await fetch(`${DIRECTUS_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Auth failed (${res.status}): ${text}`);
  }

  const { data } = await res.json();
  return data.access_token;
}

// ── 5a: Fetch real GitHub issues ─────────────────────────────────────────────

async function fetchAllIssues() {
  const allIssues = [];
  let page = 1;

  while (true) {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/issues?state=open&per_page=${PER_PAGE}&page=${page}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'issue-autopilot-dashboard',
      },
    });

    if (!res.ok) {
      const text = await res.text();

      throw new Error(`GitHub API error on page ${page} (${res.status}): ${text}`);
    }

    const items = await res.json();

    if (items.length === 0) {
      break;
    }

    // Filter out pull requests
    const issues = items.filter((item) => !item.pull_request);
    allIssues.push(...issues);

    console.log(
      `Fetched page ${page}... ${items.length} items (${issues.length} issues, ${items.length - issues.length} PRs filtered)`,
    );

    if (items.length < PER_PAGE) {
      break;
    }

    page++;
  }

  console.log(`\nTotal issues fetched: ${allIssues.length}`);
  return allIssues;
}

// ── 5b: Compute heuristic fields ────────────────────────────────────────────

function computeHeuristics(issue) {
  const now = Date.now();
  const updatedAt = new Date(issue.updated_at).getTime();
  const daysSinceUpdate = Math.max(0, Math.floor((now - updatedAt) / (1000 * 60 * 60 * 24)));

  const isStale = daysSinceUpdate > 30;

  const labelNames = (issue.labels || []).map((l) =>
    (typeof l === 'string' ? l : l.name || '').toLowerCase(),
  );

  // recommended_action
  let recommendedAction = 'devin_investigate';

  if (labelNames.some((l) => l.includes('bug'))) {
    recommendedAction = 'devin_fix';
  } else if (labelNames.some((l) => l.includes('enhancement') || l.includes('feature'))) {
    recommendedAction = 'devin_investigate';
  } else if (labelNames.some((l) => l.includes('question') || l.includes('discussion'))) {
    recommendedAction = 'human_review';
  } else if (labelNames.length === 0 && daysSinceUpdate > 90) {
    recommendedAction = 'close';
  }

  // complexity
  const bodyLength = (issue.body || '').length;
  let complexity;

  if (bodyLength < 200) {
    complexity = 'trivial';
  } else if (bodyLength < 500) {
    complexity = 'small';
  } else if (bodyLength < 1500) {
    complexity = 'medium';
  } else {
    complexity = 'large';
  }

  // confidence
  const baseConfidence = { trivial: 0.9, small: 0.75, medium: 0.5, large: 0.3 };
  let confidence = baseConfidence[complexity];

  if (recommendedAction !== 'devin_fix') {
    confidence -= 0.1;
  }

  confidence = Math.min(0.95, Math.max(0.1, confidence));

  return {
    is_stale: isStale,
    days_stale: daysSinceUpdate,
    recommended_action: recommendedAction,
    complexity,
    confidence,
  };
}

function mapIssueToRecord(issue) {
  const heuristics = computeHeuristics(issue);

  return {
    github_id: issue.id,
    repo: GITHUB_REPO,
    title: issue.title,
    body: issue.body || '',
    labels: (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name || '')),
    github_url: issue.html_url,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    ...heuristics,
    status: 'queued',
  };
}

// ── 5c: Write issues to Directus ────────────────────────────────────────────

async function fetchExistingGithubIds(token) {
  const ids = new Set();
  let page = 1;

  while (true) {
    const res = await fetch(
      `${DIRECTUS_URL}/items/issues?fields=github_id&limit=${PER_PAGE}&page=${page}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch existing issues (${res.status}): ${text}`);
    }

    const { data } = await res.json();

    if (!data || data.length === 0) {
      break;
    }

    for (const item of data) {
      ids.add(Number(item.github_id));
    }

    if (data.length < PER_PAGE) {
      break;
    }

    page++;
  }

  return ids;
}

async function batchCreateIssues(token, records) {
  let created = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    const res = await fetch(`${DIRECTUS_URL}/items/issues`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Batch create failed at offset ${i} (${res.status}): ${text}`);
    }

    created += batch.length;
    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: created ${batch.length} issues`);
  }

  return created;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  try {
    // Fetch GitHub issues
    console.log(`Fetching open issues from ${GITHUB_REPO}…\n`);
    const ghIssues = await fetchAllIssues();

    // Authenticate with Directus
    console.log(`\nConnecting to Directus at ${DIRECTUS_URL}…`);
    const token = await getAccessToken();
    console.log('Authenticated successfully.\n');

    // Check for duplicates
    console.log('Checking for existing issues in Directus…');
    const existingIds = await fetchExistingGithubIds(token);
    console.log(`Found ${existingIds.size} existing issues.\n`);

    // Map and filter
    const allRecords = ghIssues.map(mapIssueToRecord);
    const newRecords = allRecords.filter((r) => !existingIds.has(r.github_id));
    const skipped = allRecords.length - newRecords.length;

    if (newRecords.length === 0) {
      console.log('No new issues to insert — all already exist.');
    } else {
      console.log(`Inserting ${newRecords.length} new issues (skipping ${skipped} duplicates)…\n`);
      const created = await batchCreateIssues(token, newRecords);
      console.log(`\nCreated ${created} issues in Directus, skipped ${skipped} duplicates`);
    }

    console.log(`\nSeed complete! Total issues fetched: ${allRecords.length}, newly ingested: ${newRecords.length}`);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

main();
