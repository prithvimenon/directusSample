import {
  Bot,
  Calendar,
  Clock,
  ExternalLink,
  GitPullRequest,
  Play,
  Tag,
  X,
} from 'lucide-react';
import type { DevinRun, Issue } from '../types';
import { StatusBadge } from './StatusBadge';

interface IssueDetailPanelProps {
  issue: Issue;
  runs: DevinRun[];
  onClose: () => void;
  onHandOffToDevin: (issue: Issue) => void;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.7) return 'bg-emerald-500';
  if (confidence >= 0.4) return 'bg-amber-500';
  return 'bg-rose-500';
}

function getRunStatusStyle(status: string): string {
  if (status === 'merged') return 'bg-emerald-100 text-emerald-700';
  if (status === 'running') return 'bg-amber-100 text-amber-700';
  if (status === 'pr_opened') return 'bg-purple-100 text-purple-700';
  if (status === 'failed' || status === 'escalated') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-600';
}

const recommendationLabels: Record<string, { label: string; desc: string }> = {
  devin_fix: { label: 'Devin Fix', desc: 'Devin can autonomously fix this issue' },
  devin_investigate: { label: 'Investigate', desc: 'Devin should investigate and propose a solution' },
  human_review: { label: 'Human Review', desc: 'Requires human judgment and review' },
  close: { label: 'Close', desc: 'Not actionable at this time' },
};

export function IssueDetailPanel({ issue, runs, onClose, onHandOffToDevin }: IssueDetailPanelProps) {
  const issueRuns = runs.filter((r) => {
    const runIssueId = typeof r.issue === 'object' ? r.issue.id : r.issue;
    return runIssueId === issue.id;
  });

  const rec = recommendationLabels[issue.recommended_action];

  // Determine if the issue has an active Devin session (running or queued)
  const activeRun = issueRuns.find(
    (r) => r.status === 'running' || r.status === 'queued'
  );

  // Determine if the issue already has any Devin run (to decide whether to show "Hand off" button)
  const hasDevinRun = issueRuns.length > 0;

  // Build a Devin session URL from the session_id
  const getDevinSessionUrl = (sessionId: string) => {
    return `https://app.devin.ai/sessions/${sessionId}`;
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
        <div className="mr-3 flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-mono text-xs text-slate-400">
              #{issue.github_id.toString().slice(-5)}
            </span>
            <StatusBadge status={issue.status} />
          </div>
          <h3 className="text-sm font-bold text-slate-900 leading-tight truncate">
            {issue.title}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="px-5 py-4 space-y-4 max-h-[calc(100vh-28rem)] overflow-y-auto">
        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-0.5">
              <Clock className="h-3 w-3" /> Age
            </div>
            <p className={`text-sm font-semibold ${issue.days_stale > 30 ? 'text-rose-600' : 'text-slate-900'}`}>
              {issue.days_stale} days
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-0.5">
              <Tag className="h-3 w-3" /> Complexity
            </div>
            <p className="text-sm font-semibold text-slate-900 capitalize">{issue.complexity}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-0.5">
              <Calendar className="h-3 w-3" /> Created
            </div>
            <p className="text-sm font-semibold text-slate-900">{formatDate(issue.created_at)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <div className="text-xs text-slate-500 mb-0.5">Confidence</div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full ${getConfidenceColor(issue.confidence)}`}
                  style={{ width: `${Math.round(issue.confidence * 100)}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-slate-900">
                {Math.round(issue.confidence * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Recommendation */}
        {rec && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 mb-0.5">
              Recommendation
            </p>
            <p className="text-sm font-bold text-indigo-900">{rec.label}</p>
            <p className="text-xs text-indigo-600 mt-0.5">{rec.desc}</p>
          </div>
        )}

        {/* Labels */}
        {issue.labels && issue.labels.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Labels</p>
            <div className="flex flex-wrap gap-1.5">
              {issue.labels.map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Devin Runs */}
        {issueRuns.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Devin Runs
            </p>
            <div className="space-y-2">
              {issueRuns.map((run) => (
                <div key={run.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-slate-500">{run.session_id}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getRunStatusStyle(run.status)}`}>
                      {run.status.replace('_', ' ')}
                    </span>
                  </div>
                  {run.notes && <p className="text-xs text-slate-600 mt-1">{run.notes}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    {run.pr_url && (
                      <a
                        href={run.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                      >
                        <GitPullRequest className="h-3 w-3" /> View PR #{run.pr_number}
                      </a>
                    )}
                    {/* Open Devin Session button for active runs */}
                    {(run.status === 'running' || run.status === 'queued') && (
                      <a
                        href={getDevinSessionUrl(run.session_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-all hover:from-violet-600 hover:to-indigo-700 hover:shadow"
                      >
                        <Play className="h-3 w-3" /> Open Devin Session
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Body (truncated) */}
        {issue.body && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Description</p>
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700 leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap">
              {issue.body.length > 500 ? issue.body.slice(0, 500) + '...' : issue.body}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons footer */}
      <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-3 space-y-2">
        {/* Hand off to Devin button — show if issue is not yet assigned or is a candidate */}
        {!hasDevinRun && (issue.status === 'unreviewed' || issue.status === 'candidate' || issue.status === 'approved') && (
          <button
            onClick={() => onHandOffToDevin(issue)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-indigo-200 transition-all hover:from-violet-600 hover:to-indigo-700 hover:shadow-lg hover:shadow-indigo-300"
          >
            <Bot className="h-4 w-4" /> Hand off to Devin
          </button>
        )}

        {/* Open Devin Session button — shown when there's an active run */}
        {activeRun && (
          <a
            href={getDevinSessionUrl(activeRun.session_id)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-amber-200 transition-all hover:from-amber-600 hover:to-orange-600 hover:shadow-lg hover:shadow-amber-300"
          >
            <Play className="h-4 w-4" /> Open Devin Session
          </a>
        )}

        <a
          href={issue.github_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          <ExternalLink className="h-4 w-4" /> View on GitHub
        </a>
      </div>
    </div>
  );
}
