import { Calendar, Clock, ExternalLink, GitPullRequest, Tag, X } from 'lucide-react';
import type { DevinRun, Issue } from '../types';
import { StatusBadge } from './StatusBadge';

interface IssueDrawerProps {
  issue: Issue | null;
  runs: DevinRun[];
  onClose: () => void;
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
  skip: { label: 'Skip', desc: 'Not actionable at this time' },
};

export function IssueDrawer({ issue, runs, onClose }: IssueDrawerProps) {
  if (!issue) return null;

  const issueRuns = runs.filter((r) => {
    const runIssueId = typeof r.issue === 'object' ? r.issue.id : r.issue;
    return runIssueId === issue.id;
  });

  const rec = recommendationLabels[issue.recommended_action];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-5">
          <div className="mr-4 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-xs text-slate-400">
                #{issue.github_id.toString().slice(-5)}
              </span>
              <StatusBadge status={issue.status} />
            </div>
            <h2 className="text-lg font-bold text-slate-900 leading-tight">
              {issue.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <Clock className="h-3.5 w-3.5" /> Age
              </div>
              <p className={`text-sm font-semibold ${issue.days_stale > 30 ? 'text-rose-600' : 'text-slate-900'}`}>
                {issue.days_stale} days
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <Tag className="h-3.5 w-3.5" /> Complexity
              </div>
              <p className="text-sm font-semibold text-slate-900 capitalize">{issue.complexity}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <Calendar className="h-3.5 w-3.5" /> Created
              </div>
              <p className="text-sm font-semibold text-slate-900">{formatDate(issue.created_at)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500 mb-1">Confidence</div>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
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
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 mb-1">
                Recommendation
              </p>
              <p className="text-sm font-bold text-indigo-900">{rec.label}</p>
              <p className="text-xs text-indigo-600 mt-0.5">{rec.desc}</p>
            </div>
          )}

          {/* Labels */}
          {issue.labels && issue.labels.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Labels</p>
              <div className="flex flex-wrap gap-2">
                {issue.labels.map((label) => (
                  <span
                    key={label}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
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
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                Devin Runs
              </p>
              <div className="space-y-2">
                {issueRuns.map((run) => (
                  <div key={run.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-slate-500">{run.session_id}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getRunStatusStyle(run.status)}`}>
                        {run.status.replace('_', ' ')}
                      </span>
                    </div>
                    {run.notes && <p className="text-xs text-slate-600 mt-1">{run.notes}</p>}
                    {run.pr_url && (
                      <a
                        href={run.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                      >
                        <GitPullRequest className="h-3 w-3" /> View PR #{run.pr_number}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Body (truncated) */}
          {issue.body && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Description</p>
              <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-700 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
                {issue.body.length > 800 ? issue.body.slice(0, 800) + '...' : issue.body}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <a
            href={issue.github_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            <ExternalLink className="h-4 w-4" /> View on GitHub
          </a>
        </div>
      </div>
    </>
  );
}
