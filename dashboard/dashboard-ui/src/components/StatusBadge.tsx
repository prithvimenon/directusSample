import { cn } from '../lib/utils';
import type { IssueStatus } from '../types';

const statusConfig: Record<IssueStatus, { label: string; bg: string; text: string; ring: string }> = {
  unreviewed: {
    label: 'Unreviewed',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    ring: 'ring-slate-300',
  },
  candidate: {
    label: 'Candidate',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    ring: 'ring-blue-300',
  },
  approved: {
    label: 'Approved',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    ring: 'ring-indigo-300',
  },
  in_progress: {
    label: 'In Progress',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    ring: 'ring-amber-300',
  },
  pr_opened: {
    label: 'PR Opened',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    ring: 'ring-purple-300',
  },
  merged: {
    label: 'Merged',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    ring: 'ring-emerald-300',
  },
  escalated: {
    label: 'Escalated',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    ring: 'ring-rose-300',
  },
};

interface StatusBadgeProps {
  status: IssueStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.unreviewed;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset transition-colors',
        config.bg,
        config.text,
        config.ring,
        className
      )}
    >
      <span className={cn(
        'mr-1.5 h-1.5 w-1.5 rounded-full',
        status === 'merged' && 'bg-emerald-500',
        status === 'in_progress' && 'bg-amber-500 animate-pulse',
        status === 'pr_opened' && 'bg-purple-500',
        status === 'escalated' && 'bg-rose-500',
        status === 'approved' && 'bg-indigo-500',
        status === 'candidate' && 'bg-blue-500',
        status === 'unreviewed' && 'bg-slate-400',
      )} />
      {config.label}
    </span>
  );
}
