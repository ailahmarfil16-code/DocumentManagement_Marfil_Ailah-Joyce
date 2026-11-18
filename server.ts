import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createDocumentApiApp } from './server/app.ts';
import { runDocumentApiTestSuite } from './server/testRunner.ts';

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'documents.db');
const STORAGE_DIR = path.resolve(process.cwd(), 'storage', 'documents');
const SEED_MARKER = path.join(DATA_DIR, '.seeded');

async function seedInitialSampleDocuments(
  instance: ReturnType<typeof createDocumentApiApp>,
): Promise<void> {
  if (fs.existsSync(SEED_MARKER) || instance.repository.listAll().length > 0) {
    return;
  }

  const samples = [
    {
      originalFilename: 'Engagement_Scope_Overview.txt',
      contentType: 'text/plain',
      content: [
        'P&A Grant Thornton - Technology Solutions Group',
        'Document Management REST API Reference Specimen',
        '',
        'This document is stored on disk using a UUID storage identifier while',
        'its metadata (OriginalFilename, StoredFilename, ContentType, FileSize,',
        'UploadedAt) is persisted in a relational SQLite database.',
      ].join('\n'),
    },
    {
      originalFilename: 'API_Endpoints_Specification.md',
      contentType: 'text/markdown',
      content: [
        '# Document Management REST API Endpoints',
        '',
        '- `POST /api/documents` — Multipart upload (max 10 MB)',
        '- `GET /api/documents` — List document metadata',
        '- `GET /api/documents/{id}` — Retrieve single document metadata',
        '- `GET /api/documents/{id}/download` — Stream stored file bytes',
        '- `DELETE /api/documents/{id}` — Transactional delete of record & file',
      ].join('\n'),
    },
    {
      originalFilename: 'Retention_Schedule_2026.csv',
      contentType: 'text/csv',
      content: [
        'Category,RetentionYears,MaxSizeMB,StorageClass',
        'AuditWorkpapers,7,10,Standard',
        'ClientDeliverables,10,10,Archive',
        'ComplianceRecords,7,10,Standard',
      ].join('\n'),
    },
  ];

  for (const sample of samples) {
    const id = instance.storage.generateDocumentId();
    const storedFilename = instance.storage.buildStoredFilename(id, sample.originalFilename);
    const buffer = Buffer.from(sample.content, 'utf-8');
    await instance.storage.saveBuffer(storedFilename, buffer);
    instance.repository.insert({
      id,
      originalFilename: sample.originalFilename,
      storedFilename,
      contentType: sample.contentType,
      fileSize: buffer.byteLength,
      uploadedAt: new Date().toISOString(),
    });
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SEED_MARKER, new Date().toISOString(), 'utf-8');
}

async function startServer(): Promise<void> {
  const apiInstance = createDocumentApiApp({
    dbPath: DB_PATH,
    storageDir: STORAGE_DIR,
    dotnetDir: path.resolve(process.cwd(), 'dotnet'),
    onRunTests: runDocumentApiTestSuite,
  });

  await seedInitialSampleDocuments(apiInstance);

  const rootApp = apiInstance.app;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    rootApp.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    rootApp.use(express.static(distDir));
    rootApp.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  rootApp.listen(PORT, '0.0.0.0', () => {
    console.log(`Document Management REST API running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
