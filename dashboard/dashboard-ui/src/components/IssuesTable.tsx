import { ChevronDown, ChevronUp, Filter, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Issue, IssueStatus } from '../types';
import { StatusBadge } from './StatusBadge';

interface IssuesTableProps {
  issues: Issue[];
  loading: boolean;
  onSelectIssue: (issue: Issue) => void;
  selectedIssueId: number | null;
}

function getAgeColor(days: number): string {
  if (days > 30) return 'text-rose-600';
  if (days > 7) return 'text-amber-600';
  return 'text-slate-600';
}

function getConfidenceBarColor(confidence: number): string {
  if (confidence >= 0.7) return 'bg-emerald-500';
  if (confidence >= 0.4) return 'bg-amber-500';
  return 'bg-rose-500';
}

const complexityColors: Record<string, string> = {
  trivial: 'text-sky-600 bg-sky-50',
  small: 'text-emerald-600 bg-emerald-50',
  medium: 'text-amber-600 bg-amber-50',
  large: 'text-rose-600 bg-rose-50',
};

const recommendationLabels: Record<string, { label: string; color: string }> = {
  devin_fix: { label: 'Devin Fix', color: 'text-violet-700 bg-violet-50 ring-violet-200' },
  devin_investigate: { label: 'Investigate', color: 'text-sky-700 bg-sky-50 ring-sky-200' },
  human_review: { label: 'Human Review', color: 'text-amber-700 bg-amber-50 ring-amber-200' },
  close: { label: 'Close', color: 'text-slate-600 bg-slate-50 ring-slate-200' },
};

type SortField = 'title' | 'days_stale' | 'complexity' | 'confidence' | 'status';
type SortDir = 'asc' | 'desc';

const allStatuses: IssueStatus[] = [
  'unreviewed', 'candidate', 'approved', 'in_progress', 'pr_opened', 'merged', 'escalated',
];

export function IssuesTable({ issues, loading, onSelectIssue, selectedIssueId }: IssuesTableProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('days_stale');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [statusFilter, setStatusFilter] = useState<IssueStatus[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    let result = issues;

    if (search.trim()) {
      const q = search.toLowerCase();

      result = result.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.github_id.toString().includes(q) ||
          (i.labels || []).some((l) => l.toLowerCase().includes(q))
      );
    }

    if (statusFilter.length > 0) {
      result = result.filter((i) => statusFilter.includes(i.status));
    }

    result = [...result].sort((a, b) => {
      let cmp = 0;

      switch (sortField) {
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
        case 'days_stale':
          cmp = a.days_stale - b.days_stale;
          break;

        case 'complexity': {
          const order = { trivial: 0, small: 1, medium: 2, large: 3 };
          cmp = (order[a.complexity as keyof typeof order] ?? 1) - (order[b.complexity as keyof typeof order] ?? 1);
          break;
        }

        case 'confidence':
          cmp = a.confidence - b.confidence;
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
      }

      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [issues, search, sortField, sortDir, statusFilter]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const toggleStatus = (status: IssueStatus) => {
    setStatusFilter((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDown className="h-3.5 w-3.5 text-slate-300" />;
    return sortDir === 'asc' ? (
      <ChevronUp className="h-3.5 w-3.5 text-indigo-500" />
    ) : (
      <ChevronDown className="h-3.5 w-3.5 text-indigo-500" />
    );
  };

  function getAge(days: number): string {
    if (days === 0) return 'Today';
    if (days === 1) return '1d';
    if (days < 30) return `${days}d`;
    if (days < 365) return `${Math.floor(days / 30)}mo`;
    return `${Math.floor(days / 365)}y`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-500" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Toolbar */}
      <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search issues by title, ID, or label..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              statusFilter.length > 0
                ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Filter className="h-4 w-4" />
            Filter
            {statusFilter.length > 0 && (
              <span className="rounded-full bg-indigo-500 px-1.5 text-xs text-white">
                {statusFilter.length}
              </span>
            )}
          </button>
          <div className="text-sm text-slate-500">
            {filtered.length} of {issues.length} issues
          </div>
        </div>

        {/* Filter pills */}
        {showFilters && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Status:</span>
            {allStatuses.map((status) => (
              <button
                key={status}
                onClick={() => toggleStatus(status)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter.includes(status)
                    ? 'bg-indigo-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {status.replace('_', ' ')}
              </button>
            ))}
            {statusFilter.length > 0 && (
              <button
                onClick={() => setStatusFilter([])}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/30">
              <th className="py-3 pl-5 pr-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                #
              </th>
              <th
                className="cursor-pointer py-3 px-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
                onClick={() => handleSort('title')}
              >
                <span className="flex items-center gap-1">Title <SortIcon field="title" /></span>
              </th>
              <th
                className="cursor-pointer py-3 px-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
                onClick={() => handleSort('days_stale')}
              >
                <span className="flex items-center gap-1">Age <SortIcon field="days_stale" /></span>
              </th>
              <th className="py-3 px-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                Labels
              </th>
              <th
                className="cursor-pointer py-3 px-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
                onClick={() => handleSort('complexity')}
              >
                <span className="flex items-center gap-1">Complexity <SortIcon field="complexity" /></span>
              </th>
              <th
                className="cursor-pointer py-3 px-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
                onClick={() => handleSort('confidence')}
              >
                <span className="flex items-center gap-1">Confidence <SortIcon field="confidence" /></span>
              </th>
              <th className="py-3 px-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                Recommendation
              </th>
              <th
                className="cursor-pointer py-3 px-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
                onClick={() => handleSort('status')}
              >
                <span className="flex items-center gap-1">Status <SortIcon field="status" /></span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map((issue) => (
              <tr
                key={issue.id}
                onClick={() => onSelectIssue(issue)}
                className={`cursor-pointer transition-colors ${
                  selectedIssueId === issue.id
                    ? 'bg-indigo-50/70'
                    : 'hover:bg-slate-50/70'
                }`}
              >
                <td className="py-3 pl-5 pr-2">
                  <span className="text-xs font-mono text-slate-400">
                    #{issue.github_id.toString().slice(-5)}
                  </span>
                </td>
                <td className="py-3 px-2 max-w-xs">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {issue.title}
                  </p>
                </td>
                <td className="py-3 px-2">
                  <span className={`text-sm font-medium ${getAgeColor(issue.days_stale)}`}>
                    {getAge(issue.days_stale)}
                  </span>
                </td>
                <td className="py-3 px-2">
                  <div className="flex flex-wrap gap-1">
                    {(issue.labels || []).slice(0, 2).map((label) => (
                      <span
                        key={label}
                        className="inline-block truncate rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 max-w-20"
                      >
                        {label}
                      </span>
                    ))}
                    {(issue.labels || []).length > 2 && (
                      <span className="text-xs text-slate-400">+{issue.labels.length - 2}</span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-2">
                  <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${complexityColors[issue.complexity] || 'text-slate-600 bg-slate-50'}`}>
                    {issue.complexity}
                  </span>
                </td>
                <td className="py-3 px-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${getConfidenceBarColor(issue.confidence)}`}
                        style={{ width: `${Math.round(issue.confidence * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500">
                      {Math.round(issue.confidence * 100)}%
                    </span>
                  </div>
                </td>
                <td className="py-3 px-2">
                  {issue.recommended_action && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      recommendationLabels[issue.recommended_action]?.color || 'text-slate-600 bg-slate-50 ring-slate-200'
                    }`}>
                      {recommendationLabels[issue.recommended_action]?.label || issue.recommended_action}
                    </span>
                  )}
                </td>
                <td className="py-3 px-2">
                  <StatusBadge status={issue.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="py-12 text-center text-sm text-slate-400">
          No issues match your filters.
        </div>
      )}
    </div>
  );
}
