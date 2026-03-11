import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  GitMerge,
  GitPullRequest,
  Inbox,
  Play,
} from 'lucide-react';
import type { ActivityLogEntry, EventType } from '../types';

interface ActivityLogProps {
  entries: ActivityLogEntry[];
  loading: boolean;
}

const eventConfig: Record<EventType, { icon: typeof Inbox; color: string; bg: string }> = {
  issue_ingested: { icon: Inbox, color: 'text-slate-500', bg: 'bg-slate-100' },
  issue_approved: { icon: CheckCircle2, color: 'text-indigo-500', bg: 'bg-indigo-100' },
  devin_started: { icon: Play, color: 'text-amber-500', bg: 'bg-amber-100' },
  pr_opened: { icon: GitPullRequest, color: 'text-purple-500', bg: 'bg-purple-100' },
  pr_merged: { icon: GitMerge, color: 'text-emerald-500', bg: 'bg-emerald-100' },
  awaiting_review: { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-100' },
  escalated: { icon: AlertTriangle, color: 'text-rose-500', bg: 'bg-rose-100' },
};

/* Map system event messages to outcome-oriented labels */
const outcomeMessages: Record<string, string> = {
  'Issue ingested': 'Issue added to backlog',
  'Issue ingested from directus/directus': 'Issue added to backlog',
  'Devin session started': 'Devin started implementation',
  'Issue approved and queued': 'Approved for autonomous fix',
  'Issue approved': 'Approved for autonomous fix',
  'PR opened': 'PR opened for review',
  'PR merged': 'Merged',
  'Escalated to human': 'Escalated to human owner',
  'Escalated': 'Escalated to human owner',
};

function getOutcomeMessage(original: string): string {
  // Check exact match first
  if (outcomeMessages[original]) return outcomeMessages[original];
  // Check prefix matches
  const lower = original.toLowerCase();
  if (lower.startsWith('issue ingested')) return 'Issue added to backlog';
  if (lower.startsWith('devin session started') || lower.startsWith('devin started')) return 'Devin started implementation';
  if (lower.startsWith('issue approved')) return 'Approved for autonomous fix';
  if (lower.startsWith('pr opened') || lower.startsWith('pull request opened')) return 'PR opened for review';
  if (lower.startsWith('pr merged') || lower.startsWith('pull request merged')) return 'Merged';
  if (lower.startsWith('escalat')) return 'Escalated to human owner';
  if (lower.startsWith('awaiting review')) return 'Awaiting reviewer';
  return original;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ActivityLog({ entries, loading }: ActivityLogProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8">
        <div className="flex items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4">
        <h3 className="text-sm font-bold text-slate-900">Activity Feed</h3>
        <p className="text-xs text-slate-500 mt-0.5">Recent autopilot events</p>
      </div>

      <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
        {entries.map((entry) => {
          const config = eventConfig[entry.event_type] || eventConfig.issue_ingested;
          const Icon = config.icon;

          return (
            <div
              key={entry.id}
              className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-slate-50/50"
            >
              <div className={`mt-0.5 flex-shrink-0 rounded-lg p-1.5 ${config.bg}`}>
                <Icon className={`h-3.5 w-3.5 ${config.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-700 leading-snug truncate">{getOutcomeMessage(entry.message)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{timeAgo(entry.timestamp)}</p>
              </div>
            </div>
          );
        })}
      </div>

      {entries.length === 0 && (
        <div className="py-8 text-center text-sm text-slate-400">
          No activity yet
        </div>
      )}
    </div>
  );
}
