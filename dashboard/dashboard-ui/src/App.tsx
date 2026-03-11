import { Bot, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { ActivityLog } from './components/ActivityLog';
import { IssueDrawer } from './components/IssueDrawer';
import { IssuesTable } from './components/IssuesTable';
import { KPICards } from './components/KPICards';
import { useActivityLog, useDevinRuns, useIssues } from './hooks/useDirectus';
import type { Issue } from './types';
import './App.css';

function App() {
  const { issues, loading: issuesLoading, refresh: refreshIssues } = useIssues();
  const { runs, loading: runsLoading } = useDevinRuns();
  const { entries, loading: activityLoading } = useActivityLog();
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshIssues();
    setRefreshing(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/60 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-200">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                Issue Autopilot
              </h1>
              <p className="text-xs text-slate-500">Autonomous issue resolution dashboard</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition-all hover:bg-slate-50 hover:shadow disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-screen-2xl px-6 py-6 space-y-6">
        {/* KPI Cards */}
        <KPICards issues={issues} runs={runs} />

        {/* Table + Activity split */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
          {/* Issues Table — takes 3/4 */}
          <div className="xl:col-span-3">
            <IssuesTable
              issues={issues}
              loading={issuesLoading || runsLoading}
              onSelectIssue={setSelectedIssue}
              selectedIssueId={selectedIssue?.id ?? null}
            />
          </div>

          {/* Activity Log — takes 1/4 */}
          <div className="xl:col-span-1">
            <ActivityLog entries={entries} loading={activityLoading} />
          </div>
        </div>
      </main>

      {/* Issue Detail Drawer */}
      {selectedIssue && (
        <IssueDrawer
          issue={selectedIssue}
          runs={runs}
          onClose={() => setSelectedIssue(null)}
        />
      )}
    </div>
  );
}

export default App;
