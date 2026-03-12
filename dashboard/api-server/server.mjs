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

    // 0. Fetch triage data from Directus (if available) to enrich the prompt
    let triageContext = '';

    try {
      const triageTokenRes = await fetch(`${DIRECTUS_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: process.env.DIRECTUS_ADMIN_EMAIL || 'admin@example.com',
          password: process.env.DIRECTUS_ADMIN_PASSWORD || 'admin123',
        }),
      });

      if (triageTokenRes.ok) {
        const triageTokenData = await triageTokenRes.json();

        const triageRes = await fetch(
          `${DIRECTUS_URL}/items/issues/${issueId}?fields=triage_summary,relevant_files,suggested_approach,risk_areas,estimated_effort`,
          { headers: { Authorization: `Bearer ${triageTokenData.data.access_token}` } },
        );

        if (triageRes.ok) {
          const { data: triage } = await triageRes.json();

          if (triage.triage_summary) {
            const parts = [];
            parts.push(`## Triage Analysis (AI-generated context)`);
            parts.push(`**Summary:** ${triage.triage_summary}`);

            if (triage.suggested_approach) {
              parts.push(`**Suggested Approach:**\n${triage.suggested_approach}`);
            }

            if (triage.relevant_files && triage.relevant_files.length > 0) {
              parts.push(`**Key Files:** ${triage.relevant_files.join(', ')}`);
            }

            if (triage.risk_areas && triage.risk_areas.length > 0) {
              parts.push(`**Risk Areas:** ${triage.risk_areas.join('; ')}`);
            }

            if (triage.estimated_effort) {
              parts.push(`**Estimated Effort:** ${triage.estimated_effort.replace('_', ' ')}`);
            }

            triageContext = parts.join('\n\n');
          }
        }
      }
    } catch (triageErr) {
      console.warn('Could not fetch triage data (non-blocking):', triageErr.message);
    }

    // 1. Create a Devin session via the Devin API
    const promptParts = [
      `Fix the following GitHub issue:`,
      ``,
      `**Issue:** ${title}`,
      `**Repository:** ${repo}`,
      `**GitHub URL:** ${github_url}`,
    ];

    if (triageContext) {
      promptParts.push(``, triageContext, ``);
    }

    promptParts.push(
      ``,
      `**Description:**`,
      body ? (body.length > 2000 ? body.slice(0, 2000) + '...' : body) : 'No description provided.',
      ``,
      `Please analyze the issue, implement a fix, and open a pull request.`,
    );

    const prompt = promptParts.join('\n');

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

/**
 * POST /api/triage/analyze-issues
 * Triggers the triage agent to analyze untriaged issues via the Devin API.
 * Body (optional): { limit?: number, issueId?: number, force?: boolean }
 */
app.post('/api/triage/analyze-issues', async (req, res) => {
  try {
    const { limit = 5, issueId = null, force = false } = req.body || {};

    // 1. Authenticate with Directus
    const tokenRes = await fetch(`${DIRECTUS_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.DIRECTUS_ADMIN_EMAIL || 'admin@example.com',
        password: process.env.DIRECTUS_ADMIN_PASSWORD || 'admin123',
      }),
    });

    if (!tokenRes.ok) {
      return res.status(500).json({ error: 'Failed to authenticate with Directus' });
    }

    const tokenData = await tokenRes.json();
    const directusToken = tokenData.data.access_token;

    // 2. Fetch issues to analyze
    let fetchUrl;

    if (issueId) {
      fetchUrl = `${DIRECTUS_URL}/items/issues/${issueId}`;
    } else {
      const filter = force ? '' : '&filter[triage_summary][_null]=true';
      fetchUrl = `${DIRECTUS_URL}/items/issues?limit=${limit}&sort=-days_stale${filter}`;
    }

    const issuesRes = await fetch(fetchUrl, {
      headers: { Authorization: `Bearer ${directusToken}` },
    });

    if (!issuesRes.ok) {
      return res.status(500).json({ error: 'Failed to fetch issues from Directus' });
    }

    const issuesJson = await issuesRes.json();
    const issues = issueId ? [issuesJson.data] : issuesJson.data || [];

    if (issues.length === 0) {
      return res.json({ message: 'No untriaged issues found', sessions: [] });
    }

    console.log(`Triage: analyzing ${issues.length} issue(s)...`);

    // 3. Create Devin triage sessions for each issue (fire-and-forget polling)
    const sessions = [];

    for (const issue of issues) {
      try {
        const labels = (issue.labels || []).join(', ') || 'none';

        const bodyText = issue.body
          ? issue.body.length > 3000
            ? issue.body.slice(0, 3000) + '... (truncated)'
            : issue.body
          : 'No description provided.';

        const prompt = [
          'You are a senior software engineer triaging a GitHub issue for the directus/directus repository.',
          'Analyze this issue against the codebase and update structured output with:',
          '1. What files are involved, 2. Fix approach, 3. Risk areas, 4. Confidence score.',
          '',
          `**Title:** ${issue.title}`,
          `**Repository:** ${issue.repo}`,
          `**GitHub URL:** ${issue.github_url}`,
          `**Labels:** ${labels}`,
          '',
          '**Description:**',
          bodyText,
          '',
          'Update structured output immediately with your analysis.',
        ].join('\n');

        const devinRes = await fetch(`${DEVIN_API_URL}/sessions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${DEVIN_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt,
            title: `Triage: ${issue.title.slice(0, 80)}`,
            tags: ['triage', 'autopilot', 'github-issue'],
            structured_output_schema: {
              type: 'object',
              properties: {
                triage_summary: { type: 'string' },
                relevant_files: { type: 'array', items: { type: 'string' } },
                suggested_approach: { type: 'string' },
                risk_areas: { type: 'array', items: { type: 'string' } },
                estimated_effort: { type: 'string', enum: ['quick_fix', 'moderate', 'significant', 'major'] },
                complexity: { type: 'string', enum: ['trivial', 'small', 'medium', 'large'] },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                recommended_action: { type: 'string', enum: ['devin_fix', 'devin_investigate', 'human_review', 'close'] },
              },
              required: ['triage_summary', 'relevant_files', 'suggested_approach', 'risk_areas', 'estimated_effort', 'complexity', 'confidence', 'recommended_action'],
            },
            idempotent: false,
          }),
        });

        if (devinRes.ok) {
          const devinData = await devinRes.json();
          console.log(`  Triage session created for issue ${issue.id}: ${devinData.session_id}`);

          // Store the triage_session_id immediately
          await fetch(`${DIRECTUS_URL}/items/issues/${issue.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${directusToken}`,
            },
            body: JSON.stringify({ triage_session_id: devinData.session_id }),
          });

          sessions.push({
            issueId: issue.id,
            issueTitle: issue.title,
            sessionId: devinData.session_id,
            sessionUrl: devinData.url,
          });
        } else {
          const errText = await devinRes.text();
          console.error(`  Failed to create triage session for issue ${issue.id}: ${errText}`);
        }
      } catch (issueErr) {
        console.error(`  Error triaging issue ${issue.id}:`, issueErr.message);
      }
    }

    return res.json({
      message: `Created ${sessions.length} triage session(s). Results will be stored when sessions complete.`,
      sessions,
      note: 'Use the analyze-issues.mjs CLI script for synchronous polling, or poll GET /api/devin/sessions/:sessionId to check status.',
    });
  } catch (err) {
    console.error('Error in triage endpoint:', err);
    return res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

/**
 * POST /api/triage/store-result
 * Webhook-style endpoint to store triage results from a completed Devin session.
 * Body: { issueId: number, sessionId: string }
 */
app.post('/api/triage/store-result', async (req, res) => {
  try {
    const { issueId, sessionId } = req.body;

    if (!issueId || !sessionId) {
      return res.status(400).json({ error: 'issueId and sessionId are required' });
    }

    // 1. Fetch session data from Devin API
    const devinRes = await fetch(`${DEVIN_API_URL}/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${DEVIN_API_KEY}` },
    });

    if (!devinRes.ok) {
      return res.status(502).json({ error: 'Failed to fetch session from Devin API' });
    }

    const sessionData = await devinRes.json();
    const output = sessionData.structured_output;

    if (!output) {
      return res.status(404).json({ error: 'No structured output in session' });
    }

    const triageData = typeof output === 'string' ? JSON.parse(output) : output;

    // 2. Authenticate with Directus
    const tokenRes = await fetch(`${DIRECTUS_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.DIRECTUS_ADMIN_EMAIL || 'admin@example.com',
        password: process.env.DIRECTUS_ADMIN_PASSWORD || 'admin123',
      }),
    });

    if (!tokenRes.ok) {
      return res.status(500).json({ error: 'Failed to authenticate with Directus' });
    }

    const tokenData = await tokenRes.json();
    const directusToken = tokenData.data.access_token;

    // 3. Update the issue
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

    const patchRes = await fetch(`${DIRECTUS_URL}/items/issues/${issueId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${directusToken}`,
      },
      body: JSON.stringify(patch),
    });

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      return res.status(500).json({ error: `Failed to update issue: ${errText}` });
    }

    console.log(`Stored triage result for issue ${issueId} from session ${sessionId}`);
    return res.json({ success: true, issueId, patch });
  } catch (err) {
    console.error('Error storing triage result:', err);
    return res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

/**
 * GET /api/triage/status/:sessionId
 * Polls the Devin API for triage session status. If completed with structured output,
 * automatically stores the results in Directus and returns { completed: true, stored: true }.
 * Query param: issueId (required for auto-store)
 */
app.get('/api/triage/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const issueId = req.query.issueId ? Number(req.query.issueId) : null;

    // 1. Fetch session status from Devin API
    const devinRes = await fetch(`${DEVIN_API_URL}/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${DEVIN_API_KEY}` },
    });

    if (!devinRes.ok) {
      return res.status(devinRes.status).json({
        error: 'Failed to fetch session from Devin API',
        completed: false,
        stored: false,
      });
    }

    const sessionData = await devinRes.json();
    const statusEnum = sessionData.status_enum || sessionData.status;

    // Session still running
    if (statusEnum === 'running' || statusEnum === 'blocked') {
      return res.json({
        status: statusEnum,
        completed: false,
        stored: false,
      });
    }

    // Session finished (completed, stopped, etc.)
    const output = sessionData.structured_output;

    if (!output || !issueId) {
      return res.json({
        status: statusEnum,
        completed: true,
        stored: false,
      });
    }

    // 2. Auto-store results in Directus
    const triageData = typeof output === 'string' ? JSON.parse(output) : output;

    const tokenRes = await fetch(`${DIRECTUS_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.DIRECTUS_ADMIN_EMAIL || 'admin@example.com',
        password: process.env.DIRECTUS_ADMIN_PASSWORD || 'admin123',
      }),
    });

    if (!tokenRes.ok) {
      return res.json({
        status: statusEnum,
        completed: true,
        stored: false,
        error: 'Failed to authenticate with Directus',
      });
    }

    const tokenData = await tokenRes.json();
    const directusToken = tokenData.data.access_token;

    const patch = {
      triage_summary: triageData.triage_summary || null,
      relevant_files: triageData.relevant_files || [],
      suggested_approach: triageData.suggested_approach || null,
      risk_areas: triageData.risk_areas || [],
      estimated_effort: triageData.estimated_effort || null,
      triage_session_id: sessionId,
      triaged_at: new Date().toISOString(),
    };

    // Also update complexity/confidence/recommended_action if provided by triage
    if (triageData.complexity) patch.complexity = triageData.complexity;
    if (triageData.confidence != null) patch.confidence = triageData.confidence;
    if (triageData.recommended_action) patch.recommended_action = triageData.recommended_action;

    const patchRes = await fetch(`${DIRECTUS_URL}/items/issues/${issueId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${directusToken}`,
      },
      body: JSON.stringify(patch),
    });

    if (!patchRes.ok) {
      console.error(`Failed to store triage result for issue ${issueId}:`, await patchRes.text());
      return res.json({
        status: statusEnum,
        completed: true,
        stored: false,
        error: 'Failed to update issue in Directus',
      });
    }

    console.log(`Triage results stored for issue ${issueId} from session ${sessionId}`);

    return res.json({
      status: statusEnum,
      completed: true,
      stored: true,
    });
  } catch (err) {
    console.error('Error polling triage status:', err);
    return res.status(500).json({ error: 'Internal server error', completed: false, stored: false });
  }
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log(`Devin API key: ${DEVIN_API_KEY.slice(0, 8)}...`);
  console.log(`Directus URL: ${DIRECTUS_URL}`);
});
