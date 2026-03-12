/* eslint-disable no-console */
/**
 * Triage Agent — Analyze Issues via Devin API
 *
 * Creates Devin "triage" sessions that analyze GitHub issues against the
 * directus/directus codebase. Uses structured output to get back:
 *   - triage_summary, relevant_files, suggested_approach, risk_areas,
 *     estimated_effort, complexity, confidence, recommended_action
 *
 * Results are written back to the Directus issues collection.
 *
 * Usage:
 *   DEVIN_API_KEY=apk_xxx npm run analyze
 *   DEVIN_API_KEY=apk_xxx npm run analyze -- --limit 10
 *   DEVIN_API_KEY=apk_xxx npm run analyze -- --issue-id 42
 *   DEVIN_API_KEY=apk_xxx npm run analyze -- --force          (re-analyze already triaged)
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const ADMIN_EMAIL = process.env.DIRECTUS_ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.DIRECTUS_ADMIN_PASSWORD || 'admin123';
const DEVIN_API_KEY = process.env.DEVIN_API_KEY;
const DEVIN_API_URL = 'https://api.devin.ai/v1';

if (!DEVIN_API_KEY) {
  console.error('ERROR: DEVIN_API_KEY environment variable is required.');
  console.error('Get one at https://app.devin.ai/settings/api-keys');
  process.exit(1);
}

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let LIMIT = 5;
let SPECIFIC_ISSUE_ID = null;
let FORCE = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) {
    LIMIT = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--issue-id' && args[i + 1]) {
    SPECIFIC_ISSUE_ID = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--force') {
    FORCE = true;
  }
}

const POLL_INTERVAL_MS = 15_000; // 15 seconds between status checks
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max per session

// ── Structured output schema (JSON Schema Draft 7) ──────────────────────────

const TRIAGE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    triage_summary: {
      type: 'string',
      description:
        'A 2-3 sentence summary of what the issue is about and what fixing it would involve.',
    },
    relevant_files: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Array of file paths in the directus/directus repo most likely involved in fixing this issue. Include 3-8 specific file paths.',
    },
    suggested_approach: {
      type: 'string',
      description:
        'A step-by-step approach (3-5 steps) for how to fix this issue. Be specific about what code changes are needed.',
    },
    risk_areas: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Array of 1-3 risk areas or concerns. E.g. "May affect other export formats", "Needs migration for existing data".',
    },
    estimated_effort: {
      type: 'string',
      enum: ['quick_fix', 'moderate', 'significant', 'major'],
      description:
        'Estimated effort: quick_fix (<1hr), moderate (1-4hrs), significant (4-8hrs), major (>8hrs).',
    },
    complexity: {
      type: 'string',
      enum: ['trivial', 'small', 'medium', 'large'],
      description:
        'Code complexity: trivial (1 file, simple change), small (1-2 files), medium (3-5 files, some logic), large (many files, architectural).',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description:
        'Confidence (0.0-1.0) that Devin can autonomously fix this issue without human intervention.',
    },
    recommended_action: {
      type: 'string',
      enum: ['devin_fix', 'devin_investigate', 'human_review', 'close'],
      description:
        'Recommended action: devin_fix (Devin can fix autonomously), devin_investigate (needs more scoping), human_review (needs human judgment), close (not actionable).',
    },
  },
  required: [
    'triage_summary',
    'relevant_files',
    'suggested_approach',
    'risk_areas',
    'estimated_effort',
    'complexity',
    'confidence',
    'recommended_action',
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getDirectusToken() {
  const res = await fetch(`${DIRECTUS_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Directus auth failed (${res.status}): ${text}`);
  }

  const { data } = await res.json();
  return data.access_token;
}

function buildTriagePrompt(issue) {
  const labels = (issue.labels || []).join(', ') || 'none';

  let bodyText = 'No description provided.';

  if (issue.body) {
    bodyText = issue.body.length > 3000
      ? issue.body.slice(0, 3000) + '\n... (truncated)'
      : issue.body;
  }

  return [
    'You are a senior software engineer triaging a GitHub issue for the directus/directus repository.',
    'Your job is to analyze this issue against the codebase and determine:',
    '1. What files are likely involved in fixing this',
    '2. A concrete approach for fixing it',
    '3. Risk areas and concerns',
    '4. Whether Devin (an AI coding agent) can fix this autonomously',
    '',
    '## Issue Details',
    `**Title:** ${issue.title}`,
    `**Repository:** ${issue.repo}`,
    `**GitHub URL:** ${issue.github_url}`,
    `**Labels:** ${labels}`,
    `**Created:** ${issue.created_at}`,
    `**Last Updated:** ${issue.updated_at}`,
    '',
    '**Description:**',
    bodyText,
    '',
    '## Instructions',
    '1. Browse the directus/directus repository on GitHub',
    '2. Identify the specific files and code areas relevant to this issue',
    '3. Determine a concrete fix approach with specific steps',
    '4. Assess risks and whether this can be fixed autonomously',
    '5. Update structured output with your analysis immediately',
    '',
    'IMPORTANT: Update the structured output as soon as you have your analysis ready.',
    'Be specific about file paths — use actual paths from the repo, not guesses.',
    'For confidence, consider: Is the issue well-defined? Are the affected areas isolated?',
    'Does it need external service access or credentials?',
  ].join('\n');
}

// ── Devin API ────────────────────────────────────────────────────────────────

async function createTriageSession(issue) {
  const prompt = buildTriagePrompt(issue);

  const res = await fetch(`${DEVIN_API_URL}/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DEVIN_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      title: `Triage: ${issue.title.slice(0, 80)}`,
      tags: ['triage', 'autopilot', 'github-issue'],
      structured_output_schema: TRIAGE_OUTPUT_SCHEMA,
      idempotent: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Devin API error (${res.status}): ${text}`);
  }

  return res.json();
}

async function pollSessionUntilComplete(sessionId) {
  const startTime = Date.now();

  while (Date.now() - startTime < SESSION_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(`${DEVIN_API_URL}/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${DEVIN_API_KEY}` },
    });

    if (!res.ok) {
      console.warn(`  Warning: poll failed for ${sessionId} (${res.status})`);
      continue;
    }

    const data = await res.json();
    const status = data.status_enum;

    if (status === 'finished' || status === 'blocked' || status === 'stopped') {
      return data;
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`  Polling ${sessionId}... status=${status}, elapsed=${elapsed}s`);
  }

  throw new Error(`Session ${sessionId} timed out after ${SESSION_TIMEOUT_MS / 1000}s`);
}

function parseStructuredOutput(sessionData) {
  const output = sessionData.structured_output;

  if (!output) {
    console.warn('  No structured output found in session response');
    return null;
  }

  if (typeof output === 'string') {
    try {
      return JSON.parse(output);
    } catch {
      console.warn('  Failed to parse structured output as JSON');
      return null;
    }
  }

  return output;
}

// ── Directus update ──────────────────────────────────────────────────────────

async function updateIssueWithTriage(token, issueId, triageData, sessionId) {
  const patch = {
    triage_summary: triageData.triage_summary || null,
    relevant_files: triageData.relevant_files || [],
    suggested_approach: triageData.suggested_approach || null,
    risk_areas: triageData.risk_areas || [],
    estimated_effort: triageData.estimated_effort || null,
    complexity: triageData.complexity || null,
    confidence: triageData.confidence != null ? triageData.confidence : null,
    recommended_action: triageData.recommended_action || null,
    triage_session_id: sessionId,
    triaged_at: new Date().toISOString(),
  };

  const res = await fetch(`${DIRECTUS_URL}/items/issues/${issueId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(patch),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update issue ${issueId} (${res.status}): ${text}`);
  }

  return patch;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Devin Triage Agent ===\n');

  // 1. Authenticate with Directus
  console.log(`Connecting to Directus at ${DIRECTUS_URL}...`);
  const token = await getDirectusToken();
  console.log('Authenticated.\n');

  // 2. Fetch issues to analyze
  let fetchUrl;

  if (SPECIFIC_ISSUE_ID) {
    fetchUrl = `${DIRECTUS_URL}/items/issues/${SPECIFIC_ISSUE_ID}`;
  } else {
    const filter = FORCE ? '' : '&filter[triage_summary][_null]=true';
    fetchUrl = `${DIRECTUS_URL}/items/issues?limit=${LIMIT}&sort=-days_stale${filter}`;
  }

  console.log(`Fetching issues (limit=${LIMIT}, force=${FORCE})...`);

  const issuesRes = await fetch(fetchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!issuesRes.ok) {
    throw new Error(`Failed to fetch issues (${issuesRes.status})`);
  }

  const issuesJson = await issuesRes.json();
  const issues = SPECIFIC_ISSUE_ID ? [issuesJson.data] : issuesJson.data || [];

  if (issues.length === 0) {
    console.log('No untriaged issues found. Use --force to re-analyze all issues.');
    return;
  }

  console.log(`Found ${issues.length} issue(s) to analyze.\n`);

  // 3. Process each issue
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const shortTitle = issue.title.length > 70 ? issue.title.slice(0, 70) + '...' : issue.title;
    console.log(`[${i + 1}/${issues.length}] Analyzing: "${shortTitle}" (ID: ${issue.id})`);

    try {
      // Create triage session
      const { session_id, url: sessionUrl } = await createTriageSession(issue);
      console.log(`  Session created: ${session_id}`);
      console.log(`  URL: ${sessionUrl}`);

      // Poll until complete
      console.log(
        `  Waiting for analysis (poll every ${POLL_INTERVAL_MS / 1000}s, timeout ${SESSION_TIMEOUT_MS / 60_000}min)...`,
      );

      const sessionData = await pollSessionUntilComplete(session_id);
      console.log(`  Session finished with status: ${sessionData.status_enum}`);

      // Parse structured output
      const triageData = parseStructuredOutput(sessionData);

      if (!triageData) {
        console.warn('  SKIPPED: No structured output returned by Devin.');
        failed++;
        continue;
      }

      // Update the issue in Directus
      const patch = await updateIssueWithTriage(token, issue.id, triageData, session_id);
      console.log(`  Updated issue ${issue.id}:`);
      console.log(`    Complexity: ${patch.complexity}`);

      console.log(
        `    Confidence: ${patch.confidence != null ? Math.round(patch.confidence * 100) + '%' : 'N/A'}`,
      );

      console.log(`    Recommendation: ${patch.recommended_action}`);
      console.log(`    Effort: ${patch.estimated_effort}`);
      console.log(`    Files: ${(patch.relevant_files || []).length} identified`);
      console.log(`    Risks: ${(patch.risk_areas || []).length} identified`);
      succeeded++;
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      failed++;
    }

    console.log('');
  }

  console.log('=== Triage Complete ===');
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Total:     ${issues.length}`);
}

main().catch((err) => {
  console.error('Triage agent failed:', err.message);
  process.exit(1);
});
