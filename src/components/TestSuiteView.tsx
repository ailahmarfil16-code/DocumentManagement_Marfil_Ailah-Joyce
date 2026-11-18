import React, { useMemo, useState } from 'react';
import { CheckCircle2, Play, XCircle } from 'lucide-react';
import type { TestCaseResult, TestSuiteReport } from '../types/documents';
import { formatTimestamp } from '../utils/format';

type CategoryFilter = 'all' | TestCaseResult['category'];

export const TestSuiteView: React.FC = () => {
  const [report, setReport] = useState<TestSuiteReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const handleRunSuite = async () => {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch('/api/tests/run', { method: 'POST' });
      if (!response.ok) {
        throw new Error(`Test runner returned HTTP ${response.status}`);
      }
      const data = (await response.json()) as TestSuiteReport;
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to execute automated test suite.');
    } finally {
      setRunning(false);
    }
  };

  const filteredResults = useMemo(() => {
    if (!report) return [];
    if (categoryFilter === 'all') return report.results;
    return report.results.filter((r) => r.category === categoryFilter);
  }, [report, categoryFilter]);

  return (
    <div className="space-y-6">
      {/* Header Control Bar */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Automated Integration Test Suite
          </h2>
          <p className="mt-1 text-xs text-slate-600 max-w-2xl">
            Spins up an isolated HTTP server, temporary SQLite database, and temporary storage root
            to verify all 5 REST endpoints, 10 MB upload limits, path-traversal neutralization,
            missing-file handling, and transactional deletion.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleRunSuite()}
          disabled={running}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Play className="w-3.5 h-3.5" />
          {running ? 'Running 11 Tests…' : report ? 'Re-run All Tests' : 'Run Automated Tests'}
        </button>
      </section>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900">
          {error}
        </div>
      )}

      {report ? (
        <>
          {/* Summary Strip */}
          <section className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
            <div className="p-4">
              <div className="text-xs font-medium text-slate-500">Total Test Cases</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                {report.total}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs font-medium text-slate-500">Passed</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-700 font-mono tabular-nums">
                {report.passed}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs font-medium text-slate-500">Failed</div>
              <div
                className={`mt-1 text-2xl font-semibold font-mono tabular-nums ${
                  report.failed > 0 ? 'text-red-700' : 'text-slate-900'
                }`}
              >
                {report.failed}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs font-medium text-slate-500">Total Execution Time</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                {report.durationMs} ms
              </div>
            </div>
          </section>

          {/* Results Table */}
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-500 font-mono tabular-nums">
                Executed at {formatTimestamp(report.executedAt)}
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
                {(['all', 'core', 'validation', 'security', 'resilience'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1 text-xs font-medium rounded capitalize transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      categoryFilter === cat
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                    <th className="py-2.5 px-4">Result</th>
                    <th className="py-2.5 px-4">Scenario & Assertions</th>
                    <th className="py-2.5 px-4">Category</th>
                    <th className="py-2.5 px-4 text-right">HTTP Status</th>
                    <th className="py-2.5 px-4 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredResults.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 whitespace-nowrap align-top">
                        <span
                          className={`inline-flex items-center gap-1.5 font-medium ${
                            item.passed ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {item.passed ? (
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 shrink-0" />
                          )}
                          {item.passed ? 'Passed' : 'Failed'}
                        </span>
                      </td>
                      <td className="py-3 px-4 align-top">
                        <div className="font-medium text-slate-900">{item.name}</div>
                        <div className="mt-0.5 text-[11px] text-slate-600">{item.details}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 capitalize align-top whitespace-nowrap">
                        {item.category}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 align-top whitespace-nowrap">
                        {item.actualStatus} / {item.expectedStatus}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500 align-top whitespace-nowrap">
                        {item.durationMs} ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <section className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <h3 className="text-sm font-semibold text-slate-900">Ready to verify API behavior</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-lg mx-auto">
            Click Run Automated Tests above to execute all 11 integration checks covering upload,
            listing, retrieval, download, deletion, 10 MB size rejection, blocked file types,
            path-traversal protection, and missing physical file detection. You can also run{' '}
            <code className="font-mono text-slate-800">npm test</code> from the CLI.
          </p>
        </section>
      )}
    </div>
  );
};
