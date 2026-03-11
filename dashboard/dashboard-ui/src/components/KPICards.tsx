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
  accent: string;
  bgGradient: string;
}

function KPICard({ title, value, subtitle, icon, accent, bgGradient }: KPICardProps) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/20 ${bgGradient} p-6 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5`}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-white/70">{title}</p>
          <p className="text-4xl font-bold tracking-tight text-white">{value}</p>
          <p className="text-xs text-white/60">{subtitle}</p>
        </div>
        <div className={`rounded-xl ${accent} p-3`}>
          {icon}
        </div>
      </div>
      <div className="absolute -bottom-4 -right-4 h-24 w-24 rounded-full bg-white/5" />
      <div className="absolute -bottom-8 -right-8 h-32 w-32 rounded-full bg-white/5" />
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
        icon={<AlertCircle className="h-5 w-5 text-white" />}
        accent="bg-white/20"
        bgGradient="bg-gradient-to-br from-slate-700 to-slate-900"
      />
      <KPICard
        title="In Progress"
        value={inProgressCount}
        subtitle="Devin active sessions"
        icon={<Zap className="h-5 w-5 text-white" />}
        accent="bg-white/20"
        bgGradient="bg-gradient-to-br from-amber-500 to-orange-600"
      />
      <KPICard
        title="PRs Open"
        value={prsOpen}
        subtitle="Awaiting review"
        icon={<GitPullRequest className="h-5 w-5 text-white" />}
        accent="bg-white/20"
        bgGradient="bg-gradient-to-br from-purple-500 to-violet-700"
      />
      <KPICard
        title="Merged"
        value={mergedCount}
        subtitle="Successfully resolved"
        icon={<GitMerge className="h-5 w-5 text-white" />}
        accent="bg-white/20"
        bgGradient="bg-gradient-to-br from-emerald-500 to-teal-700"
      />
      <KPICard
        title="Escalated"
        value={escalatedCount}
        subtitle="Needs human review"
        icon={<TrendingUp className="h-5 w-5 text-white" />}
        accent="bg-white/20"
        bgGradient="bg-gradient-to-br from-rose-500 to-pink-700"
      />
      <KPICard
        title="Avg. Age"
        value={`${avgAge}d`}
        subtitle="Average issue age"
        icon={<Clock className="h-5 w-5 text-white" />}
        accent="bg-white/20"
        bgGradient="bg-gradient-to-br from-sky-500 to-blue-700"
      />
    </div>
  );
}
