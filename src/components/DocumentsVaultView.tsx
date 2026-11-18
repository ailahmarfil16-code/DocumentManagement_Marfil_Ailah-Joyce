import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  FolderOpen,
  Info,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { ApiErrorPayload, DocumentRecord } from '../types/documents';
import {
  formatBytes,
  formatTimestamp,
  getExtensionGroup,
  getExtensionLabel,
} from '../utils/format';

interface DocumentsVaultViewProps {
  documents: DocumentRecord[];
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onUploadSuccess: (doc: DocumentRecord) => void;
  onDeleteSuccess: (deletedId: string) => void;
  uploadInputRef: React.RefObject<HTMLInputElement | null>;
}

type CategoryFilter = 'all' | 'documents' | 'data' | 'images';

export const DocumentsVaultView: React.FC<DocumentsVaultViewProps> = ({
  documents,
  loading,
  error,
  onRefresh,
  onUploadSuccess,
  onDeleteSuccess,
  uploadInputRef,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<{
    type: 'success' | 'error';
    status: number;
    code?: string;
    message: string;
  } | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocumentRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DocumentRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const localInputRef = useRef<HTMLInputElement | null>(null);

  const totalBytes = useMemo(
    () => documents.reduce((acc, doc) => acc + doc.fileSize, 0),
    [documents],
  );

  const filteredDocuments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return documents.filter((doc) => {
      const matchesQuery =
        query.length === 0 ||
        doc.originalFilename.toLowerCase().includes(query) ||
        doc.id.toLowerCase().includes(query) ||
        doc.contentType.toLowerCase().includes(query);

      const matchesCategory =
        categoryFilter === 'all' || getExtensionGroup(doc.originalFilename) === categoryFilter;

      return matchesQuery && matchesCategory;
    });
  }, [documents, searchQuery, categoryFilter]);

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setUploadFeedback(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const created = (await response.json()) as DocumentRecord;
        onUploadSuccess(created);
        setSelectedDoc(created);
        setUploadFeedback({
          type: 'success',
          status: response.status,
          message: `Uploaded '${created.originalFilename}' (${formatBytes(created.fileSize)}) as ${created.storedFilename}.`,
        });
      } else {
        const payload = (await response.json().catch(() => ({
          code: 'UPLOAD_FAILED',
          message: `Server returned HTTP ${response.status}`,
        }))) as ApiErrorPayload;

        setUploadFeedback({
          type: 'error',
          status: response.status,
          code: payload.code,
          message: payload.message,
        });
      }
    } catch (err) {
      setUploadFeedback({
        type: 'error',
        status: 0,
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Unable to reach upload endpoint.',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleFileUpload(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleFileUpload(file);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setDeletingId(target.id);

    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(target.id)}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        onDeleteSuccess(target.id);
        if (selectedDoc?.id === target.id) {
          setSelectedDoc(null);
        }
        setPendingDelete(null);
      } else {
        const errPayload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
        setUploadFeedback({
          type: 'error',
          status: response.status,
          code: errPayload?.code ?? 'DELETE_FAILED',
          message: errPayload?.message ?? 'Failed to delete document.',
        });
        setPendingDelete(null);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const triggerPicker = () => {
    (uploadInputRef.current ?? localInputRef.current)?.click();
  };

  return (
    <div className="space-y-6">
      {/* Compact Metric Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Documents Stored</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
            {documents.length}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Total Disk Usage</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
            {formatBytes(totalBytes)}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Max Upload Size</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
            10.00 MB
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Persistence Layer</div>
          <div className="mt-1 text-sm font-medium text-slate-900 pt-1.5">
            SQLite Metadata · Safe Disk Storage
          </div>
        </div>
      </section>

      {/* Upload Dropzone */}
      <section
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`bg-white border rounded-lg p-6 transition-colors ${
          isDragging
            ? 'border-blue-600 bg-blue-50/40'
            : 'border-slate-200 border-dashed hover:border-slate-300'
        }`}
      >
        <input
          ref={(el) => {
            localInputRef.current = el;
            uploadInputRef.current = el;
          }}
          type="file"
          className="hidden"
          onChange={handleInputChange}
          aria-label="Select document to upload"
        />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-700">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Upload Document via POST /api/documents
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Drop a file here or browse from disk. Enforces 10 MB limit, extension allowlist
                (.pdf, .docx, .xlsx, .txt, .csv, .md, .json, .png, .jpg, .zip), and UUID disk
                naming.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={triggerPicker}
            disabled={uploading}
            className="px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {uploading ? 'Uploading…' : 'Choose File'}
          </button>
        </div>

        {uploadFeedback && (
          <div
            role="status"
            className={`mt-4 p-3 rounded-md border text-xs flex items-start justify-between gap-3 ${
              uploadFeedback.type === 'success'
                ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                : 'bg-red-50/60 border-red-200 text-red-900'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {uploadFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              )}
              <div>
                <span className="font-mono font-medium">
                  HTTP {uploadFeedback.status}
                  {uploadFeedback.code ? ` · ${uploadFeedback.code}` : ''}
                </span>
                <span className="mx-1.5 text-slate-400">—</span>
                <span>{uploadFeedback.message}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setUploadFeedback(null)}
              className="text-slate-500 hover:text-slate-800 p-0.5 cursor-pointer"
              aria-label="Dismiss message"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </section>

      {/* Main Grid + Optional Inspector Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section
          className={`bg-white border border-slate-200 rounded-lg overflow-hidden ${
            selectedDoc ? 'xl:col-span-8' : 'xl:col-span-12'
          }`}
        >
          {/* Toolbar */}
          <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by filename, UUID, or content type…"
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600 focus:bg-white transition-colors"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
                {(['all', 'documents', 'data', 'images'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setCategoryFilter(tab)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors capitalize whitespace-nowrap shrink-0 cursor-pointer ${
                      categoryFilter === tab
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => void onRefresh()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border-b border-red-200 text-xs text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Table States: Loading / Empty / Populated */}
          {loading ? (
            <div className="divide-y divide-slate-100">
              {[0, 1, 2].map((idx) => (
                <div key={idx} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="h-4 w-48 bg-slate-100 rounded animate-pulse" />
                  <div className="h-4 w-24 bg-slate-100 rounded animate-pulse" />
                  <div className="h-4 w-20 bg-slate-100 rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="py-14 px-6 text-center">
              <div className="w-10 h-10 mx-auto rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500">
                <FolderOpen className="w-5 h-5" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-900">
                {documents.length === 0 ? 'No documents uploaded yet' : 'No matching documents'}
              </h3>
              <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                {documents.length === 0
                  ? 'Upload a document using the dropzone above to persist its metadata in SQLite and store its contents safely on disk.'
                  : 'Try adjusting your search query or switching the file type filter.'}
              </p>
              <div className="mt-4">
                {documents.length === 0 ? (
                  <button
                    type="button"
                    onClick={triggerPicker}
                    className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Upload First Document
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setCategoryFilter('all');
                    }}
                    className="px-4 py-2 text-xs font-medium bg-white text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                    <th className="py-2.5 px-4">Filename & Identifier</th>
                    <th className="py-2.5 px-4">Content Type</th>
                    <th className="py-2.5 px-4 text-right">Size</th>
                    <th className="py-2.5 px-4 text-right">Uploaded (Local)</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredDocuments.map((doc) => {
                    const isSelected = selectedDoc?.id === doc.id;
                    return (
                      <tr
                        key={doc.id}
                        onClick={() => setSelectedDoc(doc)}
                        className={`h-11 transition-colors cursor-pointer ${
                          isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 truncate max-w-[260px]">
                                {doc.originalFilename}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono truncate max-w-[260px]">
                                {getExtensionLabel(doc.originalFilename)} · {doc.id}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                          {doc.contentType}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {formatBytes(doc.fileSize)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                          {formatTimestamp(doc.uploadedAt)}
                        </td>
                        <td
                          className="py-2.5 px-4 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setSelectedDoc(doc)}
                              title="Inspect metadata"
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                            >
                              <Info className="w-3.5 h-3.5" />
                            </button>
                            <a
                              href={`/api/documents/${encodeURIComponent(doc.id)}/download`}
                              title="Download document"
                              className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                            <button
                              type="button"
                              onClick={() => setPendingDelete(doc)}
                              title="Delete document"
                              className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Metadata Inspector Panel */}
        {selectedDoc && (
          <aside className="xl:col-span-4 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-slate-500">Document Metadata</div>
                <h3 className="text-sm font-semibold text-slate-900 truncate mt-0.5">
                  {selectedDoc.originalFilename}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDoc(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                aria-label="Close metadata inspector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <dl className="space-y-3 text-xs">
              <div>
                <dt className="text-slate-500">Document ID (UUID)</dt>
                <dd className="mt-0.5 font-mono text-slate-900 break-all">{selectedDoc.id}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Stored Filename (Disk Identifier)</dt>
                <dd className="mt-0.5 font-mono text-slate-900 break-all">
                  {selectedDoc.storedFilename}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-slate-500">Content Type</dt>
                  <dd className="mt-0.5 font-mono text-slate-900 truncate">
                    {selectedDoc.contentType}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">File Size</dt>
                  <dd className="mt-0.5 font-mono tabular-nums text-slate-900">
                    {formatBytes(selectedDoc.fileSize)} ({selectedDoc.fileSize.toLocaleString()} B)
                  </dd>
                </div>
              </div>
              <div>
                <dt className="text-slate-500">Uploaded At (ISO-8601 UTC)</dt>
                <dd className="mt-0.5 font-mono tabular-nums text-slate-900">
                  {selectedDoc.uploadedAt}
                </dd>
              </div>
            </dl>

            <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
              <a
                href={`/api/documents/${encodeURIComponent(selectedDoc.id)}/download`}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </a>
              <button
                type="button"
                onClick={() => setPendingDelete(selectedDoc)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white text-red-700 border border-red-200 text-xs font-medium rounded-md hover:bg-red-50 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 shadow-lg space-y-4">
            <h3 id="delete-modal-title" className="text-base font-semibold text-slate-900">
              Delete document permanently?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              This sends <code className="font-mono text-slate-900">DELETE /api/documents/{pendingDelete.id}</code> to remove both the database metadata row and the stored physical file{' '}
              <span className="font-medium text-slate-900">{pendingDelete.originalFilename}</span>.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deletingId !== null}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                disabled={deletingId !== null}
                className="px-4 py-2 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 cursor-pointer"
              >
                {deletingId ? 'Deleting…' : 'Delete Document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
