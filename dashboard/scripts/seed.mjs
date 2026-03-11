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
  console.warn('GITHUB_TOKEN not set — using unauthenticated GitHub API (60 req/hr limit)');
}

const GITHUB_REPO = 'directus/directus';
const PER_PAGE = 50;
const MAX_ISSUES = 50;
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

    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'issue-autopilot-dashboard',
    };

    if (GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
    }

    const res = await fetch(url, { headers });

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

    if (allIssues.length >= MAX_ISSUES) {
      allIssues.length = MAX_ISSUES; // trim to exact cap
      break;
    }

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

// ── Seed Devin Runs ─────────────────────────────────────────────────────────

async function seedDevinRuns(token) {
  console.log('\n── Seeding Devin Runs ──────────────────────────────────');

  // Idempotency check
  const checkRes = await fetch(`${DIRECTUS_URL}/items/devin_runs?limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!checkRes.ok) {
    const text = await checkRes.text();
    throw new Error(`Failed to check devin_runs (${checkRes.status}): ${text}`);
  }

  const checkData = await checkRes.json();

  if (checkData.data && checkData.data.length > 0) {
    console.log('Devin runs already seeded, skipping');
    return;
  }

  // Fetch candidate issues — prefer devin_fix, fall back to most stale
  let candidateIssues = [];

  const fixRes = await fetch(
    `${DIRECTUS_URL}/items/issues?filter[recommended_action][_eq]=devin_fix&limit=20&sort=-days_stale`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (fixRes.ok) {
    const fixData = await fixRes.json();
    candidateIssues = fixData.data || [];
  }

  if (candidateIssues.length < 12) {
    const fallbackRes = await fetch(`${DIRECTUS_URL}/items/issues?limit=20&sort=-days_stale`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (fallbackRes.ok) {
      const fallbackData = await fallbackRes.json();
      const existingIds = new Set(candidateIssues.map((i) => i.id));

      for (const issue of fallbackData.data || []) {
        if (!existingIds.has(issue.id)) {
          candidateIssues.push(issue);
        }
      }
    }
  }

  if (candidateIssues.length < 12) {
    console.error(`Only found ${candidateIssues.length} issues, need at least 12. Skipping Devin runs seed.`);
    return;
  }

  console.log(`Found ${candidateIssues.length} candidate issues for Devin runs`);

  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;

  const runs = [
    // 1. Hero example (merged)
    {
      issue: candidateIssues[0].id,
      session_id: 'devin-hero-001',
      status: 'merged',
      pr_url: 'https://github.com/prithvimenon/directusSample/pull/1',
      pr_number: 1,
      started_at: new Date(now - 5 * day).toISOString(),
      completed_at: new Date(now - 4 * day).toISOString(),
      notes: 'Real Devin-driven fix: exclude virtual fields from export default field selection',
    },
    // 2. In-progress (running)
    {
      issue: candidateIssues[1].id,
      session_id: 'devin-active-001',
      status: 'running',
      started_at: new Date(now - 2 * hour).toISOString(),
      completed_at: null,
      notes: 'Currently analyzing the issue and preparing a fix',
    },
    // 3-4. Queued
    {
      issue: candidateIssues[2].id,
      session_id: 'devin-queue-001',
      status: 'queued',
      started_at: new Date(now - 30 * 60 * 1000).toISOString(),
      completed_at: null,
      notes: null,
    },
    {
      issue: candidateIssues[3].id,
      session_id: 'devin-queue-002',
      status: 'queued',
      started_at: new Date(now - 30 * 60 * 1000).toISOString(),
      completed_at: null,
      notes: null,
    },
    // 5-6. Running
    {
      issue: candidateIssues[4].id,
      session_id: 'devin-run-001',
      status: 'running',
      started_at: new Date(now - 1 * hour).toISOString(),
      completed_at: null,
      notes: null,
    },
    {
      issue: candidateIssues[5].id,
      session_id: 'devin-run-002',
      status: 'running',
      started_at: new Date(now - 3 * hour).toISOString(),
      completed_at: null,
      notes: null,
    },
    // 7-9. PR opened
    {
      issue: candidateIssues[6].id,
      session_id: 'devin-pr-001',
      status: 'pr_opened',
      pr_url: 'https://github.com/directus/directus/pull/99901',
      pr_number: 99901,
      started_at: new Date(now - 2 * day).toISOString(),
      completed_at: new Date(now - 1 * day).toISOString(),
      notes: null,
    },
    {
      issue: candidateIssues[7].id,
      session_id: 'devin-pr-002',
      status: 'pr_opened',
      pr_url: 'https://github.com/directus/directus/pull/99902',
      pr_number: 99902,
      started_at: new Date(now - 3 * day).toISOString(),
      completed_at: new Date(now - 2 * day).toISOString(),
      notes: null,
    },
    {
      issue: candidateIssues[8].id,
      session_id: 'devin-pr-003',
      status: 'pr_opened',
      pr_url: 'https://github.com/directus/directus/pull/99903',
      pr_number: 99903,
      started_at: new Date(now - 4 * day).toISOString(),
      completed_at: new Date(now - 3 * day).toISOString(),
      notes: null,
    },
    // 10. Failed
    {
      issue: candidateIssues[9].id,
      session_id: 'devin-fail-001',
      status: 'failed',
      started_at: new Date(now - 2 * day).toISOString(),
      completed_at: new Date(now - 1 * day).toISOString(),
      notes: 'Issue too complex — multiple interconnected modules need changes. Escalating to human review.',
    },
    // 11-12. Escalated
    {
      issue: candidateIssues[10].id,
      session_id: 'devin-esc-001',
      status: 'escalated',
      started_at: new Date(now - 3 * day).toISOString(),
      completed_at: new Date(now - 2 * day).toISOString(),
      notes: 'Requires architectural decision — escalated to team lead',
    },
    {
      issue: candidateIssues[11].id,
      session_id: 'devin-esc-002',
      status: 'escalated',
      started_at: new Date(now - 4 * day).toISOString(),
      completed_at: new Date(now - 3 * day).toISOString(),
      notes: 'Needs access to external service credentials',
    },
  ];

  // Status mapping for patching linked issues
  const issueStatusMap = {
    merged: 'merged',
    running: 'in_progress',
    queued: 'approved',
    pr_opened: 'pr_open',
    failed: 'escalated',
    escalated: 'escalated',
  };

  for (const run of runs) {
    // Create the devin_run
    const createRes = await fetch(`${DIRECTUS_URL}/items/devin_runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(run),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(`Failed to create devin_run ${run.session_id} (${createRes.status}): ${text}`);
    }

    console.log(`  Created devin_run: ${run.session_id} (${run.status})`);

    // Patch the linked issue status
    const newIssueStatus = issueStatusMap[run.status];

    if (newIssueStatus) {
      const patchRes = await fetch(`${DIRECTUS_URL}/items/issues/${run.issue}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newIssueStatus }),
      });

      if (!patchRes.ok) {
        console.warn(`  Warning: failed to patch issue ${run.issue} status to ${newIssueStatus}`);
      }
    }
  }

  console.log('Created 12 Devin runs');
}

// ── Seed Activity Log ───────────────────────────────────────────────────────

async function seedActivityLog(token) {
  console.log('\n── Seeding Activity Log ────────────────────────────────');

  // Idempotency check
  const checkRes = await fetch(`${DIRECTUS_URL}/items/activity_log?limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!checkRes.ok) {
    const text = await checkRes.text();
    throw new Error(`Failed to check activity_log (${checkRes.status}): ${text}`);
  }

  const checkData = await checkRes.json();

  if (checkData.data && checkData.data.length > 0) {
    console.log('Activity log already seeded, skipping');
    return;
  }

  // Fetch all devin runs with issue data
  const runsRes = await fetch(
    `${DIRECTUS_URL}/items/devin_runs?fields=*,issue.id,issue.github_id,issue.repo,issue.title`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!runsRes.ok) {
    const text = await runsRes.text();
    throw new Error(`Failed to fetch devin_runs (${runsRes.status}): ${text}`);
  }

  const runsData = await runsRes.json();
  const devinRuns = runsData.data || [];

  if (devinRuns.length === 0) {
    console.log('No devin_runs found — skipping activity log seed.');
    return;
  }

  console.log(`Generating activity log entries for ${devinRuns.length} Devin runs`);

  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  const entries = [];

  for (const run of devinRuns) {
    const issueId = typeof run.issue === 'object' ? run.issue.id : run.issue;
    const issueTitle = typeof run.issue === 'object' ? run.issue.title : `Issue #${issueId}`;
    const runId = run.id;
    const startedAt = new Date(run.started_at).getTime();
    const completedAt = run.completed_at ? new Date(run.completed_at).getTime() : null;

    switch (run.status) {
      case 'merged':
        entries.push(
          {
            timestamp: new Date(startedAt - 5 * day).toISOString(),
            event_type: 'issue_ingested',
            issue: issueId,
            devin_run: runId,
            message: `Issue ingested: ${issueTitle}`,
          },
          {
            timestamp: new Date(startedAt - 1 * day).toISOString(),
            event_type: 'issue_approved',
            issue: issueId,
            devin_run: runId,
            message: `Issue approved for Devin fix: ${issueTitle}`,
          },
          {
            timestamp: new Date(startedAt).toISOString(),
            event_type: 'devin_started',
            issue: issueId,
            devin_run: runId,
            message: `Devin session started: ${run.session_id}`,
          },
          {
            timestamp: new Date(startedAt + 12 * hour).toISOString(),
            event_type: 'pr_opened',
            issue: issueId,
            devin_run: runId,
            message: `PR opened by Devin: ${run.pr_url || 'N/A'}`,
          },
          {
            timestamp: new Date(completedAt).toISOString(),
            event_type: 'pr_merged',
            issue: issueId,
            devin_run: runId,
            message: `PR merged: ${run.pr_url || 'N/A'}`,
          },
        );

        break;

      case 'running':
        entries.push(
          {
            timestamp: new Date(startedAt - 3 * day).toISOString(),
            event_type: 'issue_ingested',
            issue: issueId,
            devin_run: runId,
            message: `Issue ingested: ${issueTitle}`,
          },
          {
            timestamp: new Date(startedAt - 2 * hour).toISOString(),
            event_type: 'issue_approved',
            issue: issueId,
            devin_run: runId,
            message: `Issue approved for Devin fix: ${issueTitle}`,
          },
          {
            timestamp: new Date(startedAt).toISOString(),
            event_type: 'devin_started',
            issue: issueId,
            devin_run: runId,
            message: `Devin session started: ${run.session_id}`,
          },
        );

        break;

      case 'queued':
        entries.push(
          {
            timestamp: new Date(startedAt - 2 * day).toISOString(),
            event_type: 'issue_ingested',
            issue: issueId,
            devin_run: runId,
            message: `Issue ingested: ${issueTitle}`,
          },
          {
            timestamp: new Date(startedAt).toISOString(),
            event_type: 'issue_approved',
            issue: issueId,
            devin_run: runId,
            message: `Issue approved and queued: ${issueTitle}`,
          },
        );

        break;

      case 'pr_opened':
        entries.push(
          {
            timestamp: new Date(startedAt - 5 * day).toISOString(),
            event_type: 'issue_ingested',
            issue: issueId,
            devin_run: runId,
            message: `Issue ingested: ${issueTitle}`,
          },
          {
            timestamp: new Date(startedAt - 1 * day).toISOString(),
            event_type: 'issue_approved',
            issue: issueId,
            devin_run: runId,
            message: `Issue approved for Devin fix: ${issueTitle}`,
          },
          {
            timestamp: new Date(startedAt).toISOString(),
            event_type: 'devin_started',
            issue: issueId,
            devin_run: runId,
            message: `Devin session started: ${run.session_id}`,
          },
          {
            timestamp: new Date(completedAt).toISOString(),
            event_type: 'pr_opened',
            issue: issueId,
            devin_run: runId,
            message: `PR opened by Devin: ${run.pr_url || 'N/A'}`,
          },
        );

        break;

      case 'failed':
      case 'escalated':
        entries.push(
          {
            timestamp: new Date(startedAt - 4 * day).toISOString(),
            event_type: 'issue_ingested',
            issue: issueId,
            devin_run: runId,
            message: `Issue ingested: ${issueTitle}`,
          },
          {
            timestamp: new Date(startedAt - 1 * day).toISOString(),
            event_type: 'issue_approved',
            issue: issueId,
            devin_run: runId,
            message: `Issue approved for Devin fix: ${issueTitle}`,
          },
          {
            timestamp: new Date(startedAt).toISOString(),
            event_type: 'devin_started',
            issue: issueId,
            devin_run: runId,
            message: `Devin session started: ${run.session_id}`,
          },
          {
            timestamp: new Date(completedAt).toISOString(),
            event_type: 'escalated',
            issue: issueId,
            devin_run: runId,
            message: `Escalated: ${run.notes || 'Requires human review'}`,
          },
        );

        break;
    }
  }

  // Add ~15 generic issue_ingested entries for random queued issues
  const queuedRes = await fetch(
    `${DIRECTUS_URL}/items/issues?filter[status][_eq]=queued&limit=15`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (queuedRes.ok) {
    const queuedData = await queuedRes.json();
    const queuedIssues = queuedData.data || [];
    const now = Date.now();

    for (let i = 0; i < queuedIssues.length; i++) {
      const daysAgo = Math.random() * 7;

      entries.push({
        timestamp: new Date(now - daysAgo * day).toISOString(),
        event_type: 'issue_ingested',
        issue: queuedIssues[i].id,
        devin_run: null,
        message: `Issue ingested: ${queuedIssues[i].title}`,
      });
    }

    console.log(`Added ${queuedIssues.length} generic issue_ingested entries`);
  }

  // Batch insert in chunks of 50
  let created = 0;

  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);

    const insertRes = await fetch(`${DIRECTUS_URL}/items/activity_log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(batch),
    });

    if (!insertRes.ok) {
      const text = await insertRes.text();
      throw new Error(`Failed to insert activity_log batch at offset ${i} (${insertRes.status}): ${text}`);
    }

    created += batch.length;
    console.log(`  Batch ${Math.floor(i / 50) + 1}: inserted ${batch.length} entries`);
  }

  console.log(`Created ${created} activity log entries`);
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

    // Delete all existing issues for a clean dataset
    console.log('Cleaning existing issues for fresh seed…');

    const existingRes = await fetch(`${DIRECTUS_URL}/items/issues?limit=-1&fields=id`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (existingRes.ok) {
      const existingData = await existingRes.json();
      const existingCount = (existingData.data || []).length;

      if (existingCount > 0) {
        const ids = existingData.data.map((item) => item.id);

        const deleteRes = await fetch(`${DIRECTUS_URL}/items/issues`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(ids),
        });

        if (deleteRes.ok) {
          console.log(`Cleared ${existingCount} existing issues (replacing with fresh GitHub data)`);
        } else {
          console.warn(`Warning: failed to clear existing issues, continuing anyway…`);
        }
      } else {
        console.log('No existing issues to clear.');
      }
    }

    // Map and insert all issues
    const allRecords = ghIssues.map(mapIssueToRecord);

    if (allRecords.length === 0) {
      console.log('No issues fetched from GitHub.');
    } else {
      console.log(`\nInserting ${allRecords.length} issues…\n`);
      const created = await batchCreateIssues(token, allRecords);
      console.log(`\nCreated ${created} issues in Directus`);
    }

    // Seed Devin runs and activity log
    await seedDevinRuns(token);
    await seedActivityLog(token);

    console.log(`\nSeed complete! Total issues: ${allRecords.length}`);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

main();
