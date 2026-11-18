import React, { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { Check, Copy, Download, FileCode2 } from 'lucide-react';
import type { DotnetFileEntry } from '../types/documents';

export const DotnetSolutionView: React.FC = () => {
  const [files, setFiles] = useState<DotnetFileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [lastName, setLastName] = useState('Dela_Cruz');
  const [firstName, setFirstName] = useState('Juan');
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/dotnet/files')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ files: DotnetFileEntry[] }>;
      })
      .then((data) => {
        if (!active) return;
        setFiles(data.files);
        if (data.files.length > 0) {
          const preferred =
            data.files.find((f) => f.path.endsWith('DocumentsController.cs')) ?? data.files[0];
          setSelectedPath(preferred.path);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load C# reference files.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const repoName = useMemo(() => {
    const cleanLast = lastName.trim().replace(/\s+/g, '_') || 'LastName';
    const cleanFirst = firstName.trim().replace(/\s+/g, '_') || 'FirstName';
    return `DocumentManagement_${cleanLast}_${cleanFirst}`;
  }, [lastName, firstName]);

  const activeFile = useMemo(
    () => files.find((f) => f.path === selectedPath) ?? null,
    [files, selectedPath],
  );

  const handleCopyFile = async () => {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownloadZip = async () => {
    if (files.length === 0) return;
    setExporting(true);
    try {
      const zip = new JSZip();
      const rootFolder = zip.folder(repoName);
      if (rootFolder) {
        for (const file of files) {
          rootFolder.file(file.path, file.content);
        }
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${repoName}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Export & Naming Convention Header */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              ASP.NET Core 8 (C#) & SQL Server Reference Solution
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Complete C# Web API, Entity Framework Core DbContext, SQL Server T-SQL schema, xUnit
              integration tests, and submission README packaged for the required GitHub naming
              convention.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Last Name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600 focus:bg-white w-40"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                First Name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600 focus:bg-white w-40"
              />
            </div>
            <div className="pb-1.5 text-xs font-mono text-slate-700">
              Repository: <span className="font-semibold text-slate-900">{repoName}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleDownloadZip()}
          disabled={loading || files.length === 0 || exporting}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          {exporting ? 'Packaging ZIP…' : `Download ${repoName}.zip`}
        </button>
      </section>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900">
          {error}
        </div>
      )}

      {/* File Explorer + Code Viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 text-xs font-semibold text-slate-900">
            Solution Files ({files.length})
          </div>
          {loading ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-4 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[580px] overflow-y-auto">
              {files.map((file) => {
                const isSelected = file.path === selectedPath;
                return (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setSelectedPath(file.path)}
                    className={`w-full text-left px-4 py-2.5 text-xs flex items-center gap-2 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-slate-100 font-medium text-slate-900'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <FileCode2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-mono truncate">{file.path}</span>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
          {activeFile ? (
            <>
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
                <span className="text-xs font-mono font-medium text-slate-900 truncate">
                  {activeFile.path}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopyFile()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <pre className="p-4 text-xs font-mono text-slate-800 bg-slate-50/60 overflow-x-auto max-h-[580px] leading-relaxed">
                {activeFile.content}
              </pre>
            </>
          ) : (
            <div className="p-10 text-center text-xs text-slate-500">
              Select a file from the left tree to inspect its source code.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
