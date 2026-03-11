import {
  AlertCircle,
  Clock,
  GitMerge,
  GitPullRequest,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type { DevinRun, Issue } from '../types';

interface KPICardsProps {
  issues: Issue[];
  runs: DevinRun[];
}

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
}

function KPICard({ title, value, subtitle, icon }: KPICardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{title}</p>
          <p className="text-3xl font-bold tracking-tight text-slate-900">{value}</p>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-500">
          {icon}
        </div>
      </div>
    </div>
  );
}

export function KPICards({ issues, runs }: KPICardsProps) {
  const totalIssues = issues.length;
  const unreviewedCount = issues.filter((i) => i.status === 'unreviewed').length;
  const inProgressCount = runs.filter((r) => r.status === 'running').length;
  const prsOpen = runs.filter((r) => r.status === 'pr_opened').length;
  const mergedCount = runs.filter((r) => r.status === 'merged').length;
  const escalatedCount = issues.filter((i) => i.status === 'escalated').length;

  const avgAge = issues.length > 0
    ? Math.round(issues.reduce((sum, i) => sum + i.days_stale, 0) / issues.length)
    : 0;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
      <KPICard
        title="Total Issues"
        value={totalIssues}
        subtitle={`${unreviewedCount} unreviewed`}
        icon={<AlertCircle className="h-5 w-5" />}
      />
      <KPICard
        title="In Progress"
        value={inProgressCount}
        subtitle="Devin active sessions"
        icon={<Zap className="h-5 w-5" />}
      />
      <KPICard
        title="PRs Open"
        value={prsOpen}
        subtitle="Awaiting review"
        icon={<GitPullRequest className="h-5 w-5" />}
      />
      <KPICard
        title="Merged"
        value={mergedCount}
        subtitle="Successfully resolved"
        icon={<GitMerge className="h-5 w-5" />}
      />
      <KPICard
        title="Escalated"
        value={escalatedCount}
        subtitle="Needs human review"
        icon={<TrendingUp className="h-5 w-5" />}
      />
      <KPICard
        title="Avg. Age"
        value={`${avgAge}d`}
        subtitle="Average issue age"
        icon={<Clock className="h-5 w-5" />}
      />
    </div>
  );
}
