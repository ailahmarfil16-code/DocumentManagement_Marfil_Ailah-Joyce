import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Code2,
  Files,
  FlaskConical,
  Menu,
  Terminal,
  Upload,
  X,
} from 'lucide-react';
import { ApiExplorerView } from './components/ApiExplorerView';
import { DocumentsVaultView } from './components/DocumentsVaultView';
import { DotnetSolutionView } from './components/DotnetSolutionView';
import { TestSuiteView } from './components/TestSuiteView';
import type { DocumentRecord, WorkspaceView } from './types/documents';

const NAV_ITEMS: Array<{
  id: WorkspaceView;
  label: string;
  icon: typeof Files;
}> = [
  { id: 'vault', label: 'Documents Vault', icon: Files },
  { id: 'explorer', label: 'API Explorer', icon: Terminal },
  { id: 'tests', label: 'Automated Tests', icon: FlaskConical },
  { id: 'dotnet', label: 'ASP.NET Core (C#)', icon: Code2 },
];

export default function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>('vault');
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/documents');
      if (!response.ok) {
        throw new Error(`Failed to fetch documents (HTTP ${response.status})`);
      }
      const data = (await response.json()) as DocumentRecord[];
      setDocuments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach document API.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  const handleUploadSuccess = useCallback((created: DocumentRecord) => {
    setDocuments((prev) => [created, ...prev.filter((d) => d.id !== created.id)]);
  }, []);

  const handleDeleteSuccess = useCallback((deletedId: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== deletedId));
  }, []);

  const handleHeaderUploadClick = () => {
    if (activeView !== 'vault') {
      setActiveView('vault');
      setTimeout(() => uploadInputRef.current?.click(), 80);
    } else {
      uploadInputRef.current?.click();
    }
  };

  const activeNavLabel = NAV_ITEMS.find((item) => item.id === activeView)?.label ?? 'Documents Vault';

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-white border-r border-slate-200">
        <div className="h-14 px-5 border-b border-slate-200 flex items-center">
          <span className="font-display text-sm font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Document Management API
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1" aria-label="Workspace navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 text-[11px] text-slate-500 space-y-1">
          <div className="font-medium text-slate-700">Specification Scope</div>
          <div>5 REST Endpoints · 10 MB Limit</div>
          <div>SQLite Relational · Safe Disk Storage</div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-50 w-64 bg-white h-full border-r border-slate-200 flex flex-col">
            <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between">
              <span className="font-display text-sm font-bold text-slate-900">
                Document Management API
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveView(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Breadcrumb Header */}
        <header className="h-14 px-4 sm:px-6 bg-white border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded cursor-pointer"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
              <span className="hidden sm:inline">Document Management</span>
              <span className="hidden sm:inline text-slate-300">/</span>
              <h1 className="text-sm font-semibold text-slate-900 truncate">{activeNavLabel}</h1>
            </div>
          </div>

          <button
            type="button"
            onClick={handleHeaderUploadClick}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload Document
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1360px] w-full mx-auto">
          {activeView === 'vault' && (
            <DocumentsVaultView
              documents={documents}
              loading={loading}
              error={error}
              onRefresh={fetchDocuments}
              onUploadSuccess={handleUploadSuccess}
              onDeleteSuccess={handleDeleteSuccess}
              uploadInputRef={uploadInputRef}
            />
          )}

          {activeView === 'explorer' && (
            <ApiExplorerView documents={documents} onRefreshDocuments={fetchDocuments} />
          )}

          {activeView === 'tests' && <TestSuiteView />}

          {activeView === 'dotnet' && <DotnetSolutionView />}
        </main>
      </div>
    </div>
  );
}
