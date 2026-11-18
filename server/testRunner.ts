import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {
  createDocumentApiApp,
  type TestCaseResult,
  type TestSuiteReport,
} from './app.ts';
import type { DocumentRecord } from './database.ts';
import { MAX_FILE_SIZE_BYTES } from './storage.ts';

async function runSingleTest(
  id: string,
  name: string,
  category: TestCaseResult['category'],
  expectedStatus: number,
  fn: () => Promise<{ actualStatus: number; details: string }>,
): Promise<TestCaseResult> {
  const start = performance.now();
  try {
    const { actualStatus, details } = await fn();
    const durationMs = Math.round((performance.now() - start) * 10) / 10;
    return {
      id,
      name,
      category,
      passed: actualStatus === expectedStatus,
      durationMs,
      expectedStatus,
      actualStatus,
      details,
    };
  } catch (err) {
    const durationMs = Math.round((performance.now() - start) * 10) / 10;
    return {
      id,
      name,
      category,
      passed: false,
      durationMs,
      expectedStatus,
      actualStatus: 0,
      details: err instanceof Error ? err.message : 'Assertion failed.',
    };
  }
}

export async function runDocumentApiTestSuite(): Promise<TestSuiteReport> {
  const suiteStart = performance.now();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docmgmt-suite-'));
  const dbPath = path.join(tempRoot, 'test-documents.db');
  const storageDir = path.join(tempRoot, 'storage');

  const instance = createDocumentApiApp({ dbPath, storageDir });
  const server = http.createServer(instance.app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind ephemeral test server.');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const results: TestCaseResult[] = [];
  let createdDoc: DocumentRecord | null = null;

  try {
    // 1. Successful document upload
    results.push(
      await runSingleTest(
        'upload-valid',
        'Upload valid document persists metadata & physical file',
        'core',
        201,
        async () => {
          const form = new FormData();
          const content = 'P&A Grant Thornton Technical Assessment Sample Payload';
          form.append('file', new Blob([content], { type: 'text/plain' }), 'audit-summary.txt');

          const res = await fetch(`${baseUrl}/api/documents`, { method: 'POST', body: form });
          const body = (await res.json()) as DocumentRecord;

          assert.equal(res.status, 201);
          assert.ok(body.id && body.id.length >= 32, 'Expected generated UUID');
          assert.equal(body.originalFilename, 'audit-summary.txt');
          assert.equal(body.fileSize, Buffer.byteLength(content));
          assert.ok(
            fs.existsSync(path.join(storageDir, body.storedFilename)),
            'Physical file must exist on disk',
          );
          createdDoc = body;
          return {
            actualStatus: res.status,
            details: `Created ID ${body.id.slice(0, 8)}… (${body.fileSize} B) stored safely as ${body.storedFilename}.`,
          };
        },
      ),
    );

    // 2. List documents excludes file contents
    results.push(
      await runSingleTest(
        'list-documents',
        'List documents returns metadata without file contents',
        'core',
        200,
        async () => {
          const res = await fetch(`${baseUrl}/api/documents`);
          const list = (await res.json()) as Array<Record<string, unknown>>;

          assert.equal(res.status, 200);
          assert.ok(Array.isArray(list) && list.length >= 1, 'Expected at least 1 document');
          assert.equal('content' in list[0], false, 'Response must not include file contents');
          assert.equal('buffer' in list[0], false, 'Response must not include raw buffer');

          return {
            actualStatus: res.status,
            details: `Returned ${list.length} metadata record(s) with zero binary payload leakage.`,
          };
        },
      ),
    );

    // 3. Retrieval of an existing document
    results.push(
      await runSingleTest(
        'get-existing',
        'Retrieve existing document metadata by ID',
        'core',
        200,
        async () => {
          assert.ok(createdDoc, 'Prerequisite uploaded document missing');
          const res = await fetch(`${baseUrl}/api/documents/${createdDoc.id}`);
          const doc = (await res.json()) as DocumentRecord;

          assert.equal(res.status, 200);
          assert.equal(doc.id, createdDoc.id);
          assert.equal(doc.originalFilename, createdDoc.originalFilename);

          return {
            actualStatus: res.status,
            details: `Fetched metadata for '${doc.originalFilename}' (${doc.contentType}).`,
          };
        },
      ),
    );

    // 4. Download stored document
    results.push(
      await runSingleTest(
        'download-existing',
        'Download stored document streams exact file bytes',
        'core',
        200,
        async () => {
          assert.ok(createdDoc, 'Prerequisite uploaded document missing');
          const res = await fetch(`${baseUrl}/api/documents/${createdDoc.id}/download`);
          const text = await res.text();
          const disposition = res.headers.get('content-disposition') ?? '';

          assert.equal(res.status, 200);
          assert.equal(text, 'P&A Grant Thornton Technical Assessment Sample Payload');
          assert.ok(disposition.includes('audit-summary.txt'));

          return {
            actualStatus: res.status,
            details: `Streamed ${Buffer.byteLength(text)} bytes with Content-Disposition attachment header.`,
          };
        },
      ),
    );

    // 5. Handling of nonexistent document
    results.push(
      await runSingleTest(
        'get-nonexistent',
        'Retrieve nonexistent document returns 404 Not Found',
        'core',
        404,
        async () => {
          const fakeId = '00000000-0000-4000-8000-000000000404';
          const res = await fetch(`${baseUrl}/api/documents/${fakeId}`);
          const err = (await res.json()) as { code: string };

          assert.equal(res.status, 404);
          assert.equal(err.code, 'DOCUMENT_NOT_FOUND');

          return {
            actualStatus: res.status,
            details: `Returned 404 (${err.code}) for missing ID ${fakeId}.`,
          };
        },
      ),
    );

    // 6. Rejection of upload exceeding 10 MB size limit
    results.push(
      await runSingleTest(
        'reject-oversized',
        'Reject upload exceeding 10 MB limit with 413 Payload Too Large',
        'validation',
        413,
        async () => {
          const countBefore = instance.repository.listAll().length;
          const oversized = new Uint8Array(MAX_FILE_SIZE_BYTES + 1024);
          const form = new FormData();
          form.append('file', new Blob([oversized], { type: 'application/pdf' }), 'too-large.pdf');

          const res = await fetch(`${baseUrl}/api/documents`, { method: 'POST', body: form });
          const err = (await res.json()) as { code: string };
          const countAfter = instance.repository.listAll().length;

          assert.equal(res.status, 413);
          assert.equal(err.code, 'FILE_TOO_LARGE');
          assert.equal(countAfter, countBefore, 'No DB record may be created for rejected upload');

          return {
            actualStatus: res.status,
            details: `Rejected ${(oversized.byteLength / (1024 * 1024)).toFixed(2)} MB payload with 413 (${err.code}).`,
          };
        },
      ),
    );

    // 7. Validation: empty 0-byte file & missing multipart field
    results.push(
      await runSingleTest(
        'reject-empty-file',
        'Reject empty 0-byte upload with 400 Bad Request',
        'validation',
        400,
        async () => {
          const form = new FormData();
          form.append('file', new Blob([], { type: 'text/plain' }), 'empty.txt');

          const res = await fetch(`${baseUrl}/api/documents`, { method: 'POST', body: form });
          const err = (await res.json()) as { code: string };

          assert.equal(res.status, 400);
          assert.equal(err.code, 'EMPTY_FILE');

          return {
            actualStatus: res.status,
            details: `Rejected 0-byte file cleanly with 400 (${err.code}).`,
          };
        },
      ),
    );

    // 8. Security: blocked executable extension
    results.push(
      await runSingleTest(
        'reject-executable',
        'Block dangerous executable (.exe) upload with 415 Unsupported Media Type',
        'security',
        415,
        async () => {
          const form = new FormData();
          form.append(
            'file',
            new Blob(['MZ-binary-stub'], { type: 'application/octet-stream' }),
            'payload.exe',
          );

          const res = await fetch(`${baseUrl}/api/documents`, { method: 'POST', body: form });
          const err = (await res.json()) as { code: string };

          assert.equal(res.status, 415);
          assert.equal(err.code, 'BLOCKED_FILE_TYPE');

          return {
            actualStatus: res.status,
            details: `Blocked .exe upload with 415 (${err.code}).`,
          };
        },
      ),
    );

    // 9. Security: path traversal & filename collision neutralization
    results.push(
      await runSingleTest(
        'path-traversal-collision',
        'Neutralize path traversal & duplicate filename collisions',
        'security',
        201,
        async () => {
          const form1 = new FormData();
          form1.append('file', new Blob(['first'], { type: 'text/plain' }), '../../etc/passwd.txt');
          const res1 = await fetch(`${baseUrl}/api/documents`, { method: 'POST', body: form1 });
          const doc1 = (await res1.json()) as DocumentRecord;

          const form2 = new FormData();
          form2.append('file', new Blob(['second'], { type: 'text/plain' }), 'passwd.txt');
          const res2 = await fetch(`${baseUrl}/api/documents`, { method: 'POST', body: form2 });
          const doc2 = (await res2.json()) as DocumentRecord;

          assert.equal(res1.status, 201);
          assert.equal(res2.status, 201);
          assert.notEqual(doc1.storedFilename, doc2.storedFilename);
          assert.equal(doc1.storedFilename.includes('..'), false);
          assert.ok(fs.existsSync(path.join(storageDir, doc1.storedFilename)));
          assert.ok(fs.existsSync(path.join(storageDir, doc2.storedFilename)));

          return {
            actualStatus: res2.status,
            details: `Sanitized traversal input to '${doc1.originalFilename}' and stored distinct UUID files.`,
          };
        },
      ),
    );

    // 10. Resilience: missing physical file on download
    results.push(
      await runSingleTest(
        'missing-physical-file',
        'Handle missing physical file on disk gracefully during download',
        'resilience',
        404,
        async () => {
          const form = new FormData();
          form.append('file', new Blob(['ephemeral'], { type: 'text/plain' }), 'orphan-check.txt');
          const uploadRes = await fetch(`${baseUrl}/api/documents`, { method: 'POST', body: form });
          const uploaded = (await uploadRes.json()) as DocumentRecord;

          // Simulate external storage corruption/loss
          fs.unlinkSync(path.join(storageDir, uploaded.storedFilename));

          const downloadRes = await fetch(`${baseUrl}/api/documents/${uploaded.id}/download`);
          const err = (await downloadRes.json()) as { code: string };

          assert.equal(downloadRes.status, 404);
          assert.equal(err.code, 'PHYSICAL_FILE_MISSING');

          return {
            actualStatus: downloadRes.status,
            details: `Detected missing physical file and returned 404 (${err.code}).`,
          };
        },
      ),
    );

    // 11. Document deletion removes both DB record and physical file
    results.push(
      await runSingleTest(
        'delete-document',
        'Delete document removes both database record and stored file',
        'core',
        200,
        async () => {
          assert.ok(createdDoc, 'Prerequisite uploaded document missing');
          const delRes = await fetch(`${baseUrl}/api/documents/${createdDoc.id}`, {
            method: 'DELETE',
          });
          assert.equal(delRes.status, 200);

          const verifyRes = await fetch(`${baseUrl}/api/documents/${createdDoc.id}`);
          assert.equal(verifyRes.status, 404);
          assert.equal(
            fs.existsSync(path.join(storageDir, createdDoc.storedFilename)),
            false,
            'Physical file must be deleted from disk',
          );

          return {
            actualStatus: delRes.status,
            details: `Deleted record ${createdDoc.id.slice(0, 8)}… and removed ${createdDoc.storedFilename} from disk.`,
          };
        },
      ),
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    instance.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  return {
    total: results.length,
    passed,
    failed,
    durationMs: Math.round((performance.now() - suiteStart) * 10) / 10,
    executedAt: new Date().toISOString(),
    results,
  };
}
