import React, { useMemo, useState } from 'react';
import { Check, Copy, Play } from 'lucide-react';
import type { DocumentRecord } from '../types/documents';
import { formatBytes } from '../utils/format';

interface ApiExplorerViewProps {
  documents: DocumentRecord[];
  onRefreshDocuments: () => Promise<void>;
}

type EndpointKey = 'upload' | 'list' | 'get' | 'download' | 'delete';

interface EndpointSpec {
  key: EndpointKey;
  method: 'POST' | 'GET' | 'DELETE';
  path: string;
  title: string;
  description: string;
  requiresId: boolean;
}

const ENDPOINTS: EndpointSpec[] = [
  {
    key: 'upload',
    method: 'POST',
    path: '/api/documents',
    title: 'Upload Document',
    description: 'Accepts multipart/form-data (field: file), validates size <= 10 MB & extension, persists file + metadata.',
    requiresId: false,
  },
  {
    key: 'list',
    method: 'GET',
    path: '/api/documents',
    title: 'List Documents',
    description: 'Returns metadata for all stored documents ordered by upload timestamp without binary contents.',
    requiresId: false,
  },
  {
    key: 'get',
    method: 'GET',
    path: '/api/documents/{id}',
    title: 'Retrieve Document Details',
    description: 'Returns metadata for a single document UUID or 404 Not Found when absent.',
    requiresId: true,
  },
  {
    key: 'download',
    method: 'GET',
    path: '/api/documents/{id}/download',
    title: 'Download Document',
    description: 'Streams stored file bytes with Content-Type and Content-Disposition attachment header.',
    requiresId: true,
  },
  {
    key: 'delete',
    method: 'DELETE',
    path: '/api/documents/{id}',
    title: 'Delete Document',
    description: 'Transactionally deletes the database record and removes the physical file from disk.',
    requiresId: true,
  },
];

export const ApiExplorerView: React.FC<ApiExplorerViewProps> = ({
  documents,
  onRefreshDocuments,
}) => {
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointKey>('list');
  const [targetId, setTargetId] = useState<string>(documents[0]?.id ?? '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [responseState, setResponseState] = useState<{
    status: number;
    statusText: string;
    durationMs: number;
    headers: Array<[string, string]>;
    bodyText: string;
    downloadBlobUrl?: string;
    downloadFilename?: string;
    byteLength?: number;
  } | null>(null);

  const spec = useMemo(
    () => ENDPOINTS.find((e) => e.key === selectedEndpoint) ?? ENDPOINTS[1],
    [selectedEndpoint],
  );

  const effectiveId = targetId.trim() || documents[0]?.id || '00000000-0000-4000-8000-000000000404';
  const resolvedUrl = spec.requiresId ? spec.path.replace('{id}', effectiveId) : spec.path;

  const curlCommand = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    if (spec.key === 'upload') {
      const name = selectedFile?.name ?? 'sample.txt';
      return `curl -i -X POST "${origin}/api/documents" -F "file=@${name}"`;
    }
    if (spec.key === 'download') {
      return `curl -i -OJ "${origin}${resolvedUrl}"`;
    }
    return `curl -i -X ${spec.method} "${origin}${resolvedUrl}"`;
  }, [spec, resolvedUrl, selectedFile]);

  const handleAttachSyntheticFile = (kind: 'valid' | 'oversized' | 'blocked') => {
    if (kind === 'valid') {
      const text = `Generated test document at ${new Date().toISOString()}\nEndpoint verification specimen.`;
      setSelectedFile(new File([text], 'api-explorer-specimen.txt', { type: 'text/plain' }));
    } else if (kind === 'oversized') {
      const oversized = new Uint8Array(10 * 1024 * 1024 + 512);
      setSelectedFile(new File([oversized], 'oversized-10mb-test.pdf', { type: 'application/pdf' }));
    } else {
      setSelectedFile(
        new File(['MZ-stub'], 'disallowed-script.exe', { type: 'application/octet-stream' }),
      );
    }
  };

  const handleExecute = async () => {
    setSending(true);
    if (responseState?.downloadBlobUrl) {
      URL.revokeObjectURL(responseState.downloadBlobUrl);
    }

    const start = performance.now();
    try {
      let res: Response;
      if (spec.key === 'upload') {
        const form = new FormData();
        if (selectedFile) {
          form.append('file', selectedFile);
        }
        res = await fetch(resolvedUrl, { method: 'POST', body: form });
      } else {
        res = await fetch(resolvedUrl, { method: spec.method });
      }

      const durationMs = Math.round((performance.now() - start) * 10) / 10;
      const headers = Array.from(res.headers.entries());

      if (spec.key === 'download' && res.ok) {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const disposition = res.headers.get('content-disposition') ?? '';
        const match = /filename="([^"]+)"/.exec(disposition);
        const filename = match?.[1] ?? 'downloaded-document';

        setResponseState({
          status: res.status,
          statusText: res.statusText,
          durationMs,
          headers,
          bodyText: `Binary stream received (${formatBytes(blob.size)} · ${blob.type || 'application/octet-stream'}). Use the Download File link below to save it.`,
          downloadBlobUrl: blobUrl,
          downloadFilename: filename,
          byteLength: blob.size,
        });
      } else {
        const rawText = await res.text();
        let pretty = rawText;
        try {
          pretty = JSON.stringify(JSON.parse(rawText), null, 2);
        } catch {
          // Keep raw text if not JSON
        }

        setResponseState({
          status: res.status,
          statusText: res.statusText,
          durationMs,
          headers,
          bodyText: pretty,
        });

        if (res.ok && (spec.key === 'upload' || spec.key === 'delete')) {
          await onRefreshDocuments();
        }
      }
    } catch (err) {
      setResponseState({
        status: 0,
        statusText: 'Network Error',
        durationMs: Math.round((performance.now() - start) * 10) / 10,
        headers: [],
        bodyText: err instanceof Error ? err.message : 'Request failed.',
      });
    } finally {
      setSending(false);
    }
  };

  const handleCopyCurl = async () => {
    await navigator.clipboard.writeText(curlCommand);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 1500);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Endpoint Catalog */}
      <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">REST Endpoints</h2>
          <p className="text-xs text-slate-500 mt-0.5">Select an operation to test against the live server.</p>
        </div>
        <div className="divide-y divide-slate-100">
          {ENDPOINTS.map((endpoint) => {
            const active = endpoint.key === selectedEndpoint;
            const methodColor =
              endpoint.method === 'POST'
                ? 'text-blue-700'
                : endpoint.method === 'DELETE'
                  ? 'text-red-700'
                  : 'text-emerald-700';

            return (
              <button
                key={endpoint.key}
                type="button"
                onClick={() => setSelectedEndpoint(endpoint.key)}
                className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                  active ? 'bg-slate-100/80' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className={`font-semibold w-14 shrink-0 ${methodColor}`}>
                    {endpoint.method}
                  </span>
                  <span className="text-slate-900 truncate">{endpoint.path}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{endpoint.title}</div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Request Builder & Live Response */}
      <div className="lg:col-span-8 space-y-6">
        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2 font-mono text-sm font-semibold text-slate-900">
                <span>{spec.method}</span>
                <span>{resolvedUrl}</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">{spec.description}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleExecute()}
              disabled={sending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              {sending ? 'Sending…' : 'Send Request'}
            </button>
          </div>

          {spec.requiresId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-slate-700">
                  Target Document ID (UUID)
                </label>
                <button
                  type="button"
                  onClick={() => setTargetId('00000000-0000-4000-8000-000000000404')}
                  className="text-xs text-blue-700 hover:underline cursor-pointer"
                >
                  Fill nonexistent ID (test 404)
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  placeholder="Enter document UUID…"
                  className="px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600 focus:bg-white"
                />
                <select
                  value={documents.some((d) => d.id === targetId) ? targetId : ''}
                  onChange={(e) => {
                    if (e.target.value) setTargetId(e.target.value);
                  }}
                  className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
                >
                  <option value="">Select from existing documents…</option>
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.originalFilename} ({formatBytes(doc.fileSize)})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {spec.key === 'upload' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-medium text-slate-700">
                  Multipart File Payload (field: <code className="font-mono">file</code>)
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleAttachSyntheticFile('valid')}
                    className="text-blue-700 hover:underline cursor-pointer"
                  >
                    Attach valid .txt
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={() => handleAttachSyntheticFile('oversized')}
                    className="text-amber-700 hover:underline cursor-pointer"
                  >
                    Attach &gt;10 MB .pdf (413)
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={() => handleAttachSyntheticFile('blocked')}
                    className="text-red-700 hover:underline cursor-pointer"
                  >
                    Attach .exe (415)
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  className="text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-200 file:text-xs file:font-medium file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100"
                />
                {selectedFile && (
                  <span className="text-xs font-mono tabular-nums text-slate-600">
                    {selectedFile.name} · {formatBytes(selectedFile.size)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* cURL Snippet */}
          <div className="bg-slate-900 text-slate-100 rounded-md p-3 flex items-center justify-between gap-3">
            <code className="text-xs font-mono overflow-x-auto whitespace-nowrap">
              {curlCommand}
            </code>
            <button
              type="button"
              onClick={() => void handleCopyCurl()}
              className="p-1.5 text-slate-300 hover:text-white rounded shrink-0 cursor-pointer"
              title="Copy cURL command"
            >
              {copiedCurl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </section>

        {/* Response Viewer */}
        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Response</h3>
            {responseState && (
              <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                <span
                  className={`font-semibold ${
                    responseState.status >= 200 && responseState.status < 300
                      ? 'text-emerald-700'
                      : responseState.status >= 400 && responseState.status < 500
                        ? 'text-amber-700'
                        : 'text-red-700'
                  }`}
                >
                  HTTP {responseState.status} {responseState.statusText}
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-600">{responseState.durationMs} ms</span>
              </div>
            )}
          </div>

          {!responseState ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              Click Send Request above to execute a real HTTP call against the backend API.
            </p>
          ) : (
            <div className="space-y-4">
              {responseState.downloadBlobUrl && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md flex items-center justify-between gap-3 text-xs">
                  <span className="text-emerald-900">
                    Downloaded {responseState.downloadFilename} ({formatBytes(responseState.byteLength ?? 0)})
                  </span>
                  <a
                    href={responseState.downloadBlobUrl}
                    download={responseState.downloadFilename}
                    className="px-3 py-1.5 bg-emerald-700 text-white rounded font-medium hover:bg-emerald-800"
                  >
                    Save File
                  </a>
                </div>
              )}

              <pre className="p-4 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono text-slate-800 overflow-x-auto max-h-80">
                {responseState.bodyText || '(empty response body)'}
              </pre>

              {responseState.headers.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-medium text-slate-600 hover:text-slate-900">
                    Response Headers ({responseState.headers.length})
                  </summary>
                  <div className="mt-2 border border-slate-200 rounded-md divide-y divide-slate-100 font-mono text-[11px]">
                    {responseState.headers.map(([key, value]) => (
                      <div key={key} className="px-3 py-1.5 flex gap-3">
                        <span className="text-slate-500 w-44 shrink-0">{key}</span>
                        <span className="text-slate-900 break-all">{value}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
