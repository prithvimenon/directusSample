import { useCallback, useEffect, useState } from 'react';
import type { ActivityLogEntry, DevinRun, Issue } from '../types';

const API_URL = import.meta.env.VITE_DIRECTUS_URL || 'http://localhost:8055';

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const json = await res.json();
  return json.data as T;
}

export function useIssues() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      const data = await fetchJSON<Issue[]>(
        `${API_URL}/items/issues?limit=-1&sort=-days_stale`
      );

      setIssues(data);
    } catch {
      // silently fail — UI shows empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { issues, loading, refresh };
}

export function useDevinRuns() {
  const [runs, setRuns] = useState<DevinRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJSON<DevinRun[]>(
      `${API_URL}/items/devin_runs?fields=*,issue.id,issue.title&sort=-started_at`
    )
      .then(setRuns)
      .catch(() => { /* silently fail */ })
      .finally(() => setLoading(false));
  }, []);

  return { runs, loading };
}

export function useActivityLog() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJSON<ActivityLogEntry[]>(
      `${API_URL}/items/activity_log?sort=-timestamp&limit=50`
    )
      .then(setEntries)
      .catch(() => { /* silently fail */ })
      .finally(() => setLoading(false));
  }, []);

  return { entries, loading };
}
