import { useCallback, useEffect, useRef, useState } from 'react';
import type { Issue } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface CreateSessionResponse {
  session_id: string;
  url: string;
  devin_run_id: number | null;
  warning?: string;
}

interface TriageSessionResponse {
  issueId: number;
  sessionId: string;
  sessionUrl: string;
}

interface TriageStatusResponse {
  status: string;
  completed: boolean;
  stored: boolean;
}

interface DevinApiState {
  loading: boolean;
  error: string | null;
}

interface TriageIssueState {
  sessionId: string;
  sessionUrl: string;
  status: 'pending' | 'polling' | 'completed' | 'failed';
  error?: string;
}

interface TriageState {
  [issueId: number]: TriageIssueState;
}

export function useDevinApi() {
  const [state, setState] = useState<DevinApiState>({ loading: false, error: null });
  const [triageState, setTriageState] = useState<TriageState>({});
  const pollingRefs = useRef<Record<number, ReturnType<typeof setInterval>>>({});

  // Clean up all polling intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(pollingRefs.current).forEach(clearInterval);
    };
  }, []);

  const createSession = async (issue: Issue): Promise<CreateSessionResponse | null> => {
    setState({ loading: true, error: null });

    try {
      const res = await fetch(`${API_BASE}/api/devin/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId: issue.id,
          title: issue.title,
          body: issue.body,
          repo: issue.repo,
          github_url: issue.github_url,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        const errorMessage = errorData.details || errorData.error || `HTTP ${res.status}`;
        setState({ loading: false, error: errorMessage });
        return null;
      }

      const data: CreateSessionResponse = await res.json();
      setState({ loading: false, error: null });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      setState({ loading: false, error: message });
      return null;
    }
  };

  /** Trigger triage analysis for a single issue */
  const triggerTriage = async (issue: Issue): Promise<TriageSessionResponse | null> => {
    setTriageState((prev) => ({
      ...prev,
      [issue.id]: { sessionId: '', sessionUrl: '', status: 'pending' },
    }));

    try {
      const res = await fetch(`${API_BASE}/api/triage/analyze-issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId: issue.id, limit: 1 }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        const errorMessage = errorData.details || errorData.error || `HTTP ${res.status}`;

        setTriageState((prev) => ({
          ...prev,
          [issue.id]: { sessionId: '', sessionUrl: '', status: 'failed', error: errorMessage },
        }));

        return null;
      }

      const data = await res.json();
      const session = data.sessions?.[0] as TriageSessionResponse | undefined;

      if (!session) {
        setTriageState((prev) => ({
          ...prev,
          [issue.id]: { sessionId: '', sessionUrl: '', status: 'failed', error: 'No session created' },
        }));

        return null;
      }

      setTriageState((prev) => ({
        ...prev,
        [issue.id]: {
          sessionId: session.sessionId,
          sessionUrl: session.sessionUrl,
          status: 'polling',
        },
      }));

      // Start polling for results
      startPolling(issue.id, session.sessionId);

      return session;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';

      setTriageState((prev) => ({
        ...prev,
        [issue.id]: { sessionId: '', sessionUrl: '', status: 'failed', error: message },
      }));

      return null;
    }
  };

  /** Poll triage session status and store results when complete */
  const startPolling = (issueId: number, sessionId: string) => {
    // Clear any existing polling for this issue
    if (pollingRefs.current[issueId]) {
      clearInterval(pollingRefs.current[issueId]);
    }

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/triage/status/${sessionId}?issueId=${issueId}`);

        if (!res.ok) return; // Keep polling on transient errors

        const data: TriageStatusResponse = await res.json();

        if (data.completed) {
          clearInterval(pollingRefs.current[issueId]);
          delete pollingRefs.current[issueId];

          if (data.stored) {
            setTriageState((prev) => ({
              ...prev,
              [issueId]: {
                ...prev[issueId],
                status: 'completed',
              },
            }));
          } else {
            setTriageState((prev) => ({
              ...prev,
              [issueId]: {
                ...prev[issueId],
                status: 'failed',
                error: 'Session completed but no structured output found',
              },
            }));
          }
        }
      } catch {
        // Ignore transient errors, keep polling
      }
    };

    // Poll every 15 seconds
    pollingRefs.current[issueId] = setInterval(poll, 15000);
    // Also poll immediately
    poll();
  };

  /** Get the triage state for a specific issue */
  const getTriageStatus = (issueId: number): TriageIssueState | null =>
    triageState[issueId] ?? null;

  /** Check if any triage is currently polling */
  const isAnyTriagePolling = Object.values(triageState).some((t) => t.status === 'polling');

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), []);

  const clearTriageState = useCallback(
    (issueId: number) => {
      if (pollingRefs.current[issueId]) {
        clearInterval(pollingRefs.current[issueId]);
        delete pollingRefs.current[issueId];
      }

      setTriageState((prev) => {
        const next = { ...prev };
        delete next[issueId];
        return next;
      });
    },
    [],
  );

  return {
    createSession,
    triggerTriage,
    getTriageStatus,
    isAnyTriagePolling,
    clearError,
    clearTriageState,
    loading: state.loading,
    error: state.error,
  };
}
