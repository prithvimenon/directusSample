/* eslint-disable no-console */
/**
 * Bootstrap Schema Script
 *
 * Creates the issues, devin_runs, and activity_log collections in a local
 * Directus instance via the REST API.  Idempotent — skips collections that
 * already exist.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const ADMIN_EMAIL = process.env.DIRECTUS_ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.DIRECTUS_ADMIN_PASSWORD || 'admin123';

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

async function collectionExists(token, name) {
  const res = await fetch(`${DIRECTUS_URL}/collections/${name}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return res.ok;
}

async function createCollection(token, payload) {
  const res = await fetch(`${DIRECTUS_URL}/collections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create collection (${res.status}): ${text}`);
  }

  return res.json();
}

async function createField(token, collection, payload) {
  const res = await fetch(`${DIRECTUS_URL}/fields/${collection}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to create field "${payload.field}" on "${collection}" (${res.status}): ${text}`,
    );
  }

  return res.json();
}

async function createRelation(token, payload) {
  const res = await fetch(`${DIRECTUS_URL}/relations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create relation (${res.status}): ${text}`);
  }

  return res.json();
}

async function createPermission(token, payload) {
  const res = await fetch(`${DIRECTUS_URL}/permissions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create permission (${res.status}): ${text}`);
  }

  return res.json();
}

// ── collection definitions ───────────────────────────────────────────────────

async function bootstrapIssues(token) {
  const name = 'issues';

  if (await collectionExists(token, name)) {
    console.log(`Collection "${name}" already exists — skipping.`);
    return;
  }

  console.log(`Creating collection "${name}"…`);

  await createCollection(token, {
    collection: name,
    schema: {},
    meta: { icon: 'bug_report', note: 'GitHub issues ingested from upstream' },
  });

  const fields = [
    { field: 'github_id', type: 'bigInteger', schema: { is_nullable: false, is_unique: true }, meta: { required: true } },
    { field: 'repo', type: 'string', schema: {}, meta: {} },
    { field: 'title', type: 'string', schema: {}, meta: {} },
    { field: 'body', type: 'text', schema: {}, meta: {} },
    { field: 'labels', type: 'json', schema: {}, meta: {} },
    { field: 'github_url', type: 'string', schema: {}, meta: {} },
    { field: 'created_at', type: 'timestamp', schema: {}, meta: {} },
    { field: 'updated_at', type: 'timestamp', schema: {}, meta: {} },
    { field: 'is_stale', type: 'boolean', schema: { default_value: false }, meta: {} },
    { field: 'days_stale', type: 'integer', schema: { default_value: 0 }, meta: {} },
    {
      field: 'recommended_action',
      type: 'string',
      schema: {},
      meta: {
        interface: 'select-dropdown',
        options: {
          choices: [
            { text: 'Devin Fix', value: 'devin_fix' },
            { text: 'Devin Investigate', value: 'devin_investigate' },
            { text: 'Human Review', value: 'human_review' },
            { text: 'Close', value: 'close' },
          ],
        },
      },
    },
    {
      field: 'complexity',
      type: 'string',
      schema: {},
      meta: {
        interface: 'select-dropdown',
        options: {
          choices: [
            { text: 'Trivial', value: 'trivial' },
            { text: 'Small', value: 'small' },
            { text: 'Medium', value: 'medium' },
            { text: 'Large', value: 'large' },
          ],
        },
      },
    },
    { field: 'confidence', type: 'float', schema: {}, meta: {} },
    {
      field: 'status',
      type: 'string',
      schema: { default_value: 'unreviewed' },
      meta: {
        interface: 'select-dropdown',
        options: {
          choices: [
            { text: 'Unreviewed', value: 'unreviewed' },
            { text: 'Candidate', value: 'candidate' },
            { text: 'Approved', value: 'approved' },
            { text: 'In Progress', value: 'in_progress' },
            { text: 'PR Opened', value: 'pr_opened' },
            { text: 'Merged', value: 'merged' },
            { text: 'Escalated', value: 'escalated' },
          ],
        },
      },
    },
    { field: 'approved_by', type: 'string', schema: { is_nullable: true }, meta: {} },
    { field: 'approved_at', type: 'timestamp', schema: { is_nullable: true }, meta: {} },
    // Triage fields — populated by Devin triage agent at ingest time
    { field: 'triage_summary', type: 'text', schema: { is_nullable: true }, meta: { note: 'AI-generated summary of the issue and suggested approach' } },
    { field: 'relevant_files', type: 'json', schema: { is_nullable: true }, meta: { note: 'Array of file paths likely involved in fixing this issue' } },
    { field: 'suggested_approach', type: 'text', schema: { is_nullable: true }, meta: { note: 'AI-generated step-by-step approach for fixing the issue' } },
    { field: 'risk_areas', type: 'json', schema: { is_nullable: true }, meta: { note: 'Array of risk areas or concerns about the fix' } },
    { field: 'estimated_effort', type: 'string', schema: { is_nullable: true }, meta: { note: 'AI-estimated effort: quick_fix, moderate, significant, major' } },
    { field: 'triage_session_id', type: 'string', schema: { is_nullable: true }, meta: { note: 'Devin session ID used for triage analysis' } },
    { field: 'triaged_at', type: 'timestamp', schema: { is_nullable: true }, meta: { note: 'When the triage analysis was completed' } },
  ];

  for (const f of fields) {
    await createField(token, name, f);
  }

  console.log(`Collection "${name}" created with ${fields.length} fields.`);
}

async function bootstrapDevinRuns(token) {
  const name = 'devin_runs';

  if (await collectionExists(token, name)) {
    console.log(`Collection "${name}" already exists — skipping.`);
    return;
  }

  console.log(`Creating collection "${name}"…`);

  await createCollection(token, {
    collection: name,
    schema: {},
    meta: { icon: 'smart_toy', note: 'Devin automation run records' },
  });

  const fields = [
    { field: 'issue', type: 'integer', schema: { is_nullable: true }, meta: {} },
    { field: 'session_id', type: 'string', schema: {}, meta: {} },
    {
      field: 'status',
      type: 'string',
      schema: {},
      meta: {
        interface: 'select-dropdown',
        options: {
          choices: [
            { text: 'Queued', value: 'queued' },
            { text: 'Running', value: 'running' },
            { text: 'PR Opened', value: 'pr_opened' },
            { text: 'Merged', value: 'merged' },
            { text: 'Failed', value: 'failed' },
            { text: 'Escalated', value: 'escalated' },
          ],
        },
      },
    },
    { field: 'pr_url', type: 'string', schema: { is_nullable: true }, meta: {} },
    { field: 'pr_number', type: 'integer', schema: { is_nullable: true }, meta: {} },
    { field: 'started_at', type: 'timestamp', schema: {}, meta: {} },
    { field: 'completed_at', type: 'timestamp', schema: { is_nullable: true }, meta: {} },
    { field: 'notes', type: 'text', schema: { is_nullable: true }, meta: {} },
  ];

  for (const f of fields) {
    await createField(token, name, f);
  }

  // M2O relation: devin_runs.issue → issues.id
  await createRelation(token, {
    collection: name,
    field: 'issue',
    related_collection: 'issues',
    schema: { on_delete: 'SET NULL' },
    meta: { many_field: 'issue', one_field: null },
  });

  console.log(`Collection "${name}" created with ${fields.length} fields + relation.`);
}

async function bootstrapActivityLog(token) {
  const name = 'activity_log';

  if (await collectionExists(token, name)) {
    console.log(`Collection "${name}" already exists — skipping.`);
    return;
  }

  console.log(`Creating collection "${name}"…`);

  await createCollection(token, {
    collection: name,
    schema: {},
    meta: { icon: 'history', note: 'Audit trail of autopilot events' },
  });

  const fields = [
    { field: 'timestamp', type: 'timestamp', schema: {}, meta: {} },
    {
      field: 'event_type',
      type: 'string',
      schema: {},
      meta: {
        interface: 'select-dropdown',
        options: {
          choices: [
            { text: 'Issue Ingested', value: 'issue_ingested' },
            { text: 'Issue Approved', value: 'issue_approved' },
            { text: 'Devin Started', value: 'devin_started' },
            { text: 'PR Opened', value: 'pr_opened' },
            { text: 'PR Merged', value: 'pr_merged' },
            { text: 'Escalated', value: 'escalated' },
          ],
        },
      },
    },
    { field: 'issue', type: 'integer', schema: { is_nullable: true }, meta: {} },
    { field: 'devin_run', type: 'integer', schema: { is_nullable: true }, meta: {} },
    { field: 'message', type: 'string', schema: {}, meta: {} },
  ];

  for (const f of fields) {
    await createField(token, name, f);
  }

  // M2O relation: activity_log.issue → issues.id
  await createRelation(token, {
    collection: name,
    field: 'issue',
    related_collection: 'issues',
    schema: { on_delete: 'SET NULL' },
    meta: { many_field: 'issue', one_field: null },
  });

  // M2O relation: activity_log.devin_run → devin_runs.id
  await createRelation(token, {
    collection: name,
    field: 'devin_run',
    related_collection: 'devin_runs',
    schema: { on_delete: 'SET NULL' },
    meta: { many_field: 'devin_run', one_field: null },
  });

  console.log(`Collection "${name}" created with ${fields.length} fields + relations.`);
}

// ── public permissions ───────────────────────────────────────────────────────

async function getPublicPolicyId(token) {
  const res = await fetch(`${DIRECTUS_URL}/policies`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch policies (${res.status})`);
  }

  const { data } = await res.json();

  const publicPolicy = data.find((p) => p.admin_access === false && p.app_access === false);

  if (!publicPolicy) {
    throw new Error('No public policy found — cannot set public read permissions');
  }

  return publicPolicy.id;
}

async function setPublicReadPermissions(token) {
  console.log('Setting public read permissions…');

  const policyId = await getPublicPolicyId(token);
  console.log(`  Found public policy: ${policyId}`);

  const collections = ['issues', 'devin_runs', 'activity_log'];

  for (const collection of collections) {
    try {
      await createPermission(token, {
        policy: policyId,
        collection,
        action: 'read',
        fields: ['*'],
      });

      console.log(`  Public read on "${collection}" set.`);
    } catch (err) {
      // Permission may already exist — log and continue
      console.log(`  Permission for "${collection}" may already exist: ${err.message}`);
    }
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  try {
    console.log(`Connecting to Directus at ${DIRECTUS_URL}…`);
    const token = await getAccessToken();
    console.log('Authenticated successfully.\n');

    await bootstrapIssues(token);
    await bootstrapDevinRuns(token);
    await bootstrapActivityLog(token);

    console.log('');
    await setPublicReadPermissions(token);

    console.log('\nBootstrap complete!');
  } catch (err) {
    console.error('Bootstrap failed:', err.message);
    process.exit(1);
  }
}

main();
