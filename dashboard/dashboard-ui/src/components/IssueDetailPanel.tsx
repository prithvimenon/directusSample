import {
  AlertTriangle,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  GitMerge,
  GitPullRequest,
  Lightbulb,
  Loader2,
  Play,
  Tag,
  X,
} from 'lucide-react';
import type { ActivityLogEntry, DevinRun, Issue } from '../types';
import { StatusBadge } from './StatusBadge';

interface IssueDetailPanelProps {
  issue: Issue;
  runs: DevinRun[];
  activityEntries: ActivityLogEntry[];
  onClose: () => void;
  onHandOffToDevin: (issue: Issue) => void;
  handingOff?: boolean;
  handOffError?: string | null;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getRunStatusStyle(status: string): string {
  if (status === 'merged') return 'bg-emerald-50 text-emerald-700';
  if (status === 'running') return 'bg-blue-50 text-blue-700';
  if (status === 'pr_opened') return 'bg-purple-50 text-purple-700';
  if (status === 'failed' || status === 'escalated') return 'bg-rose-50 text-rose-700';
  return 'bg-slate-100 text-slate-600';
}

function getStepIcon(eventType: string) {
  if (eventType === 'pr_merged') return <GitMerge className="h-3.5 w-3.5 text-emerald-500" />;
  if (eventType === 'pr_opened') return <GitPullRequest className="h-3.5 w-3.5 text-purple-500" />;
  if (eventType === 'devin_started') return <Play className="h-3.5 w-3.5 text-blue-500" />;
  if (eventType === 'escalated') return <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />;
  if (eventType === 'issue_approved') return <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500" />;
  if (eventType === 'awaiting_review') return <Clock className="h-3.5 w-3.5 text-amber-500" />;
  return <Circle className="h-3.5 w-3.5 text-slate-300" />;
}

const recommendationLabels: Record<string, { label: string; desc: string }> = {
  devin_fix: { label: 'Good Devin Candidate', desc: 'Devin can autonomously fix this issue' },
  devin_investigate: { label: 'Needs Scoping', desc: 'Requires further investigation before action' },
  human_review: { label: 'Human Review', desc: 'Requires human judgment and review' },
  close: { label: 'Close', desc: 'Not actionable at this time' },
};

/* Lifecycle stepper stages */
const lifecycleStages = [
  { key: 'ingested', label: 'Ingested' },
  { key: 'triaged', label: 'Triaged' },
  { key: 'approved', label: 'Approved' },
  { key: 'devin_running', label: 'Devin Running' },
  { key: 'pr_opened', label: 'PR Opened' },
  { key: 'merged', label: 'Merged' },
] as const;

function getLifecycleStageIndex(issueStatus: string, latestRunStatus?: string): number {
  if (issueStatus === 'merged' || latestRunStatus === 'merged') return 6;
  if (issueStatus === 'pr_opened' || latestRunStatus === 'pr_opened') return 4;
  if (issueStatus === 'in_progress' || latestRunStatus === 'running') return 3;
  if (issueStatus === 'approved') return 2;
  if (issueStatus === 'candidate') return 1;
  if (issueStatus === 'escalated') return -1;
  return 0;
}

function getDevinRationale(issue: Issue): { title: string; points: string[] } | null {
  if (issue.recommended_action === 'devin_fix') {
    const points: string[] = [];
    if (issue.confidence >= 0.5) {
      points.push(`${Math.round(issue.confidence * 100)}% confidence score indicates a well-defined, solvable problem`);
    }
    if (issue.complexity === 'small' || issue.complexity === 'trivial') {
      points.push(`${issue.complexity.charAt(0).toUpperCase() + issue.complexity.slice(1)} complexity \u2014 contained scope with minimal cross-module impact`);
    } else if (issue.complexity === 'medium') {
      points.push('Medium complexity \u2014 manageable scope that Devin can handle autonomously');
    }
    if (issue.days_stale > 14) {
      points.push(`Open for ${issue.days_stale} days \u2014 a quick autonomous fix prevents further backlog aging`);
    }
    if (issue.labels && issue.labels.some((l) => l.toLowerCase().includes('bug'))) {
      points.push('Bug report with clear reproduction steps \u2014 ideal for autonomous resolution');
    }
    if (points.length === 0) {
      points.push('Heuristics indicate this issue is well-suited for autonomous resolution');
    }
    return { title: 'Good Devin Candidate', points };
  }
  if (issue.recommended_action === 'devin_investigate') {
    const points: string[] = [];
    points.push('Issue needs further scoping before implementation can begin');
    if (issue.confidence < 0.4) {
      points.push(`Low confidence (${Math.round(issue.confidence * 100)}%) \u2014 unclear requirements or multiple possible approaches`);
    }
    if (issue.complexity === 'large') {
      points.push('Large complexity \u2014 may involve architectural decisions or cross-cutting concerns');
    }
    return { title: 'Needs Scoping', points };
  }
  return null;
}

export function IssueDetailPanel({ issue, runs, activityEntries, onClose, onHandOffToDevin, handingOff, handOffError }: IssueDetailPanelProps) {
  const issueRuns = runs.filter((r) => {
    const runIssueId = typeof r.issue === 'object' ? r.issue.id : r.issue;
    return runIssueId === issue.id;
  });

  const rec = recommendationLabels[issue.recommended_action];
  const latestRun = issueRuns[0];

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

  // Get activity log entries for this issue, sorted by timestamp
  const issueActivity = activityEntries
    .filter((e) => e.issue === issue.id)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Lifecycle stepper
  const currentStageIndex = getLifecycleStageIndex(issue.status, latestRun?.status);
  const isEscalated = issue.status === 'escalated';

  // Devin rationale
  const rationale = getDevinRationale(issue);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
        <div className="mr-3 flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-mono text-xs text-slate-400">
              #{issue.github_id.toString().slice(-5)}
            </span>
            <StatusBadge status={issue.status} />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 leading-snug">
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
      <div className="px-5 py-4 space-y-5 max-h-[calc(100vh-20rem)] overflow-y-auto">
        {/* Lifecycle Stepper */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-3">
            Issue Lifecycle
          </p>
          {isEscalated ? (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
              <AlertTriangle className="h-4 w-4 text-rose-500 flex-shrink-0" />
              <p className="text-sm font-medium text-rose-700">Escalated to human owner</p>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {lifecycleStages.map((stage, idx) => {
                const isCompleted = idx < currentStageIndex;
                const isCurrent = idx === currentStageIndex;
                return (
                  <div key={stage.key} className="flex items-center flex-1">
                    <div className="flex flex-col items-center flex-1">
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                          isCompleted
                            ? 'bg-emerald-500 text-white'
                            : isCurrent
                              ? 'bg-indigo-500 text-white ring-4 ring-indigo-100'
                              : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {isCompleted ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                      </div>
                      <span
                        className={`mt-1 text-center text-[10px] leading-tight ${
                          isCompleted
                            ? 'font-medium text-emerald-600'
                            : isCurrent
                              ? 'font-semibold text-indigo-600'
                              : 'text-slate-400'
                        }`}
                      >
                        {stage.label}
                      </span>
                    </div>
                    {idx < lifecycleStages.length - 1 && (
                      <div
                        className={`h-0.5 w-full min-w-2 -mt-3.5 ${
                          idx < currentStageIndex ? 'bg-emerald-400' : 'bg-slate-200'
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Devin Rationale */}
        {rationale && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <p className="text-sm font-semibold text-slate-900">{rationale.title}</p>
            </div>
            <ul className="space-y-1.5">
              {rationale.points.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed">
                  <span className="mt-1 h-1 w-1 rounded-full bg-slate-400 flex-shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-100 p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-0.5">
              <Clock className="h-3 w-3" /> Age
            </div>
            <p className="text-sm font-semibold text-slate-900">
              {issue.days_stale} days
            </p>
          </div>
          <div className="rounded-lg border border-slate-100 p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-0.5">
              <Tag className="h-3 w-3" /> Complexity
            </div>
            <p className="text-sm font-semibold text-slate-900 capitalize">{issue.complexity}</p>
          </div>
          <div className="rounded-lg border border-slate-100 p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-0.5">
              <Calendar className="h-3 w-3" /> Created
            </div>
            <p className="text-sm font-semibold text-slate-900">{formatDate(issue.created_at)}</p>
          </div>
          <div className="rounded-lg border border-slate-100 p-2.5">
            <div className="text-xs text-slate-400 mb-0.5">Confidence</div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-900"
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
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-0.5">
              Recommendation
            </p>
            <p className="text-sm font-semibold text-slate-900">{rec.label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{rec.desc}</p>
          </div>
        )}

        {/* Labels */}
        {issue.labels && issue.labels.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-1.5">Labels</p>
            <div className="flex flex-wrap gap-1.5">
              {issue.labels.map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Devin Progress — timeline of what Devin has done/is doing */}
        {issueRuns.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-2">
              Devin Progress
            </p>
            <div className="space-y-2">
              {issueRuns.map((run) => (
                <div key={run.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-slate-400">{run.session_id}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getRunStatusStyle(run.status)}`}>
                      {run.status.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Activity timeline for this run */}
                  {issueActivity.length > 0 && (
                    <div className="ml-1 border-l border-slate-100 pl-3 space-y-2 mb-2">
                      {issueActivity.map((entry) => (
                        <div key={entry.id} className="flex items-start gap-2 relative">
                          <div className="absolute -left-[18px] top-0.5 bg-white">
                            {getStepIcon(entry.event_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-700 leading-snug">{entry.message}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{formatTimeAgo(entry.timestamp)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {run.notes && <p className="text-xs text-slate-500 italic">{run.notes}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    {run.pr_url && (
                      <a
                        href={run.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 underline underline-offset-2"
                      >
                        <GitPullRequest className="h-3 w-3" /> View PR #{run.pr_number}
                      </a>
                    )}
                    {(run.status === 'running' || run.status === 'queued') && (
                      <a
                        href={getDevinSessionUrl(run.session_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        <Play className="h-3 w-3" /> Open Session
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
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-1.5">Description</p>
            <div className="rounded-lg border border-slate-100 p-3 text-xs text-slate-600 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
              {issue.body.length > 800 ? issue.body.slice(0, 800) + '...' : issue.body}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons footer */}
      <div className="border-t border-slate-100 px-5 py-3 space-y-2">
        {/* Hand off to Devin button */}
        {!hasDevinRun && (issue.status === 'unreviewed' || issue.status === 'candidate' || issue.status === 'approved') && (
          <>
            <button
              onClick={() => onHandOffToDevin(issue)}
              disabled={handingOff}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {handingOff ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Creating Devin session...</>
              ) : (
                <><Bot className="h-4 w-4" /> Hand off to Devin</>
              )}
            </button>
            {handOffError && (
              <p className="text-xs text-rose-600 text-center">{handOffError}</p>
            )}
          </>
        )}

        {/* Open Devin Session button — shown when there's an active run */}
        {activeRun && (
          <a
            href={getDevinSessionUrl(activeRun.session_id)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            <Play className="h-4 w-4" /> Open Devin Session
          </a>
        )}

        <a
          href={issue.github_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          <ExternalLink className="h-4 w-4" /> View on GitHub
        </a>
      </div>
    </div>
  );
}
