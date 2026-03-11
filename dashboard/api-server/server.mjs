import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const DEVIN_API_KEY = process.env.DEVIN_API_KEY;
const DEVIN_API_URL = 'https://api.devin.ai/v1';
const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const PORT = process.env.API_PORT || 3001;

if (!DEVIN_API_KEY) {
  console.error('ERROR: DEVIN_API_KEY environment variable is required');
  process.exit(1);
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

/**
 * POST /api/devin/sessions
 * Creates a Devin session for a given issue, then records a devin_run and activity_log entry in Directus.
 *
 * Body: { issueId: number, title: string, body: string, repo: string, github_url: string }
 * Returns: { session_id: string, url: string, devin_run_id: number }
 */
app.post('/api/devin/sessions', async (req, res) => {
  try {
    const { issueId, title, body, repo, github_url } = req.body;

    if (!issueId || !title) {
      return res.status(400).json({ error: 'issueId and title are required' });
    }

    // 1. Create a Devin session via the Devin API
    const prompt = [
      `Fix the following GitHub issue:`,
      ``,
      `**Issue:** ${title}`,
      `**Repository:** ${repo}`,
      `**GitHub URL:** ${github_url}`,
      ``,
      `**Description:**`,
      body ? (body.length > 2000 ? body.slice(0, 2000) + '...' : body) : 'No description provided.',
      ``,
      `Please analyze the issue, implement a fix, and open a pull request.`,
    ].join('\n');

    console.log(`Creating Devin session for issue #${issueId}: "${title}"`);

    const devinResponse = await fetch(`${DEVIN_API_URL}/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEVIN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        title: `Fix: ${title}`,
        tags: ['autopilot', 'github-issue'],
      }),
    });

    if (!devinResponse.ok) {
      const errorText = await devinResponse.text();
      console.error(`Devin API error (${devinResponse.status}):`, errorText);
      return res.status(devinResponse.status).json({
        error: 'Failed to create Devin session',
        details: errorText,
      });
    }

    const devinData = await devinResponse.json();
    const { session_id, url } = devinData;

    console.log(`Devin session created: ${session_id} — ${url}`);

    // 2. Get a Directus access token
    const tokenRes = await fetch(`${DIRECTUS_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.DIRECTUS_ADMIN_EMAIL || 'admin@example.com',
        password: process.env.DIRECTUS_ADMIN_PASSWORD || 'admin123',
      }),
    });

    if (!tokenRes.ok) {
      console.error('Failed to authenticate with Directus');
      // Still return the Devin session info even if Directus write fails
      return res.json({ session_id, url, devin_run_id: null, warning: 'Created Devin session but failed to record in Directus' });
    }

    const tokenData = await tokenRes.json();
    const directusToken = tokenData.data.access_token;

    // 3. Create a devin_runs record in Directus
    const runRes = await fetch(`${DIRECTUS_URL}/items/devin_runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${directusToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        issue: issueId,
        session_id: session_id,
        status: 'queued',
        started_at: new Date().toISOString(),
        notes: `Session created via Issue Autopilot dashboard`,
      }),
    });

    let devinRunId = null;
    if (runRes.ok) {
      const runData = await runRes.json();
      devinRunId = runData.data.id;
      console.log(`Created devin_run #${devinRunId} in Directus`);
    } else {
      console.error('Failed to create devin_run in Directus:', await runRes.text());
    }

    // 4. Update issue status to 'approved' in Directus
    await fetch(`${DIRECTUS_URL}/items/issues/${issueId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${directusToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'approved' }),
    });

    // 5. Create an activity_log entry in Directus
    await fetch(`${DIRECTUS_URL}/items/activity_log`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${directusToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        event_type: 'devin_started',
        issue: issueId,
        devin_run: devinRunId,
        message: `Devin session started for: ${title}`,
      }),
    });

    console.log(`Hand-off complete for issue #${issueId}`);

    return res.json({
      session_id,
      url,
      devin_run_id: devinRunId,
    });
  } catch (err) {
    console.error('Error creating Devin session:', err);
    return res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

/**
 * GET /api/devin/sessions/:sessionId
 * Fetches the status of a Devin session from the Devin API.
 */
app.get('/api/devin/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const devinResponse = await fetch(`${DEVIN_API_URL}/sessions/${sessionId}`, {
      headers: {
        'Authorization': `Bearer ${DEVIN_API_KEY}`,
      },
    });

    if (!devinResponse.ok) {
      return res.status(devinResponse.status).json({
        error: 'Failed to fetch Devin session',
      });
    }

    const data = await devinResponse.json();
    return res.json(data);
  } catch (err) {
    console.error('Error fetching Devin session:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log(`Devin API key: ${DEVIN_API_KEY.slice(0, 8)}...`);
  console.log(`Directus URL: ${DIRECTUS_URL}`);
});
