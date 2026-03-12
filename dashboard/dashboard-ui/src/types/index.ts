export type IssueStatus =
  | 'unreviewed'
  | 'candidate'
  | 'approved'
  | 'in_progress'
  | 'pr_opened'
  | 'merged'
  | 'escalated';

export type DevinRunStatus =
  | 'queued'
  | 'running'
  | 'pr_opened'
  | 'merged'
  | 'failed'
  | 'escalated';

export type EventType =
  | 'issue_ingested'
  | 'issue_approved'
  | 'devin_started'
  | 'pr_opened'
  | 'pr_merged'
  | 'awaiting_review'
  | 'escalated';

export interface Issue {
  id: number;
  github_id: string;
  repo: string;
  title: string;
  body: string;
  labels: string[];
  github_url: string;
  created_at: string;
  updated_at: string;
  is_stale: boolean;
  days_stale: number;
  recommended_action: string;
  complexity: string;
  confidence: number;
  status: IssueStatus;
  approved_by: string | null;
  approved_at: string | null;
  // Triage fields — populated by Devin triage agent at ingest time
  triage_summary: string | null;
  relevant_files: string[] | null;
  suggested_approach: string | null;
  risk_areas: string[] | null;
  estimated_effort: 'quick_fix' | 'moderate' | 'significant' | 'major' | null;
  triage_session_id: string | null;
  triaged_at: string | null;
}

export interface DevinRun {
  id: number;
  issue: number | { id: number; title: string };
  session_id: string;
  status: DevinRunStatus;
  pr_url: string | null;
  pr_number: number | null;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
}

export interface ActivityLogEntry {
  id: number;
  timestamp: string;
  event_type: EventType;
  issue: number | null;
  devin_run: number | null;
  message: string;
}
