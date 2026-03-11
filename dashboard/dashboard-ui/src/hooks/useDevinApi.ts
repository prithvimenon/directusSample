import { useState } from 'react';
import type { Issue } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface CreateSessionResponse {
  session_id: string;
  url: string;
  devin_run_id: number | null;
  warning?: string;
}

interface DevinApiState {
  loading: boolean;
  error: string | null;
}

export function useDevinApi() {
  const [state, setState] = useState<DevinApiState>({ loading: false, error: null });

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

  return {
    createSession,
    loading: state.loading,
    error: state.error,
  };
}
