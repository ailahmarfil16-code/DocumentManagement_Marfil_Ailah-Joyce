import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { DocumentRepository } from './database.ts';
import {
  LocalDocumentStorage,
  MAX_FILE_SIZE_BYTES,
  sanitizeOriginalFilename,
  validateUploadedFile,
} from './storage.ts';

export interface TestCaseResult {
  id: string;
  name: string;
  category: 'core' | 'validation' | 'security' | 'resilience';
  passed: boolean;
  durationMs: number;
  expectedStatus: number;
  actualStatus: number;
  details: string;
}

export interface TestSuiteReport {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  executedAt: string;
  results: TestCaseResult[];
}

export interface DotnetFileEntry {
  path: string;
  name: string;
  language: string;
  content: string;
}

export interface DocumentAppOptions {
  dbPath: string;
  storageDir: string;
  dotnetDir?: string;
  onRunTests?: () => Promise<TestSuiteReport>;
}

export interface DocumentAppInstance {
  app: express.Express;
  repository: DocumentRepository;
  storage: LocalDocumentStorage;
  close: () => void;
}

function collectDotnetFiles(rootDir: string, currentDir = rootDir): DotnetFileEntry[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const files: DotnetFileEntry[] = [];

  for (const entry of entries) {
    if (entry.name === 'bin' || entry.name === 'obj' || entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectDotnetFiles(rootDir, fullPath));
    } else if (entry.isFile()) {
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
      const ext = path.extname(entry.name).toLowerCase();
      const language =
        ext === '.cs'
          ? 'csharp'
          : ext === '.csproj'
            ? 'xml'
            : ext === '.json'
              ? 'json'
              : ext === '.sql'
                ? 'sql'
                : ext === '.md'
                  ? 'markdown'
                  : 'text';

      files.push({
        path: relPath,
        name: entry.name,
        language,
        content: fs.readFileSync(fullPath, 'utf-8'),
      });
    }
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function createDocumentApiApp(options: DocumentAppOptions): DocumentAppInstance {
  const app = express();
  const repository = new DocumentRepository(options.dbPath);
  const storage = new LocalDocumentStorage(options.storageDir);

  app.use(express.json());

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_FILE_SIZE_BYTES,
      files: 1,
    },
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    const docs = repository.listAll();
    res.json({
      status: 'healthy',
      database: 'sqlite',
      storageRoot: storage.rootDir,
      maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
      documentCount: docs.length,
    });
  });

  // 4.1 Upload Document: POST /api/documents
  app.post('/api/documents', (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, async (err: unknown) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
              code: 'FILE_TOO_LARGE',
              message: `Uploaded file exceeds the maximum allowed size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`,
              maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
            });
          }
          if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
              code: 'UNEXPECTED_FIELD',
              message: "Unexpected upload field. Send a single file under the multipart/form-data field name 'file'.",
            });
          }
          return res.status(400).json({
            code: err.code,
            message: err.message,
          });
        }
        return next(err);
      }

      const uploadedFile = req.file;
      if (!uploadedFile) {
        return res.status(400).json({
          code: 'MISSING_FILE',
          message: "A multipart/form-data file field named 'file' is required.",
        });
      }

      const validationError = validateUploadedFile(
        uploadedFile.originalname,
        uploadedFile.mimetype,
        uploadedFile.size,
      );

      if (validationError) {
        return res.status(validationError.status).json({
          code: validationError.code,
          message: validationError.message,
        });
      }

      const documentId = storage.generateDocumentId();
      const sanitizedOriginal = sanitizeOriginalFilename(uploadedFile.originalname);
      const storedFilename = storage.buildStoredFilename(documentId, sanitizedOriginal);
      const uploadedAt = new Date().toISOString();
      const contentType = uploadedFile.mimetype || 'application/octet-stream';

      let fileSaved = false;
      try {
        await storage.saveBuffer(storedFilename, uploadedFile.buffer);
        fileSaved = true;

        const record = repository.insert({
          id: documentId,
          originalFilename: sanitizedOriginal,
          storedFilename,
          contentType,
          fileSize: uploadedFile.size,
          uploadedAt,
        });

        res.setHeader('Location', `/api/documents/${record.id}`);
        return res.status(201).json(record);
      } catch (persistErr) {
        if (fileSaved) {
          await storage.deleteIfExists(storedFilename).catch(() => undefined);
        }
        const message =
          persistErr instanceof Error ? persistErr.message : 'Failed to persist uploaded document.';
        return res.status(500).json({
          code: 'UPLOAD_PERSISTENCE_ERROR',
          message,
        });
      }
    });
  });

  // 4.2 List Documents: GET /api/documents
  app.get('/api/documents', (_req: Request, res: Response) => {
    const documents = repository.listAll();
    res.status(200).json(documents);
  });

  // 4.3 Retrieve Document Details: GET /api/documents/:id
  app.get('/api/documents/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    const document = repository.getById(id);

    if (!document) {
      return res.status(404).json({
        code: 'DOCUMENT_NOT_FOUND',
        message: `Document '${id}' was not found.`,
      });
    }

    return res.status(200).json(document);
  });

  // 4.4 Download Document: GET /api/documents/:id/download
  app.get('/api/documents/:id/download', async (req: Request, res: Response) => {
    const id = req.params.id;
    const document = repository.getById(id);

    if (!document) {
      return res.status(404).json({
        code: 'DOCUMENT_NOT_FOUND',
        message: `Document '${id}' was not found.`,
      });
    }

    const existsOnDisk = await storage.exists(document.storedFilename);
    if (!existsOnDisk) {
      return res.status(404).json({
        code: 'PHYSICAL_FILE_MISSING',
        message: `Metadata exists for '${id}', but the physical file '${document.storedFilename}' could not be found on disk.`,
      });
    }

    const safeDisplayName = sanitizeOriginalFilename(document.originalFilename).replace(/"/g, "'");
    const encodedFilename = encodeURIComponent(document.originalFilename);

    res.setHeader('Content-Type', document.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', String(document.fileSize));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeDisplayName}"; filename*=UTF-8''${encodedFilename}`,
    );

    const stream = storage.createReadStream(document.storedFilename);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({
          code: 'FILE_STREAM_ERROR',
          message: 'An error occurred while reading the stored document.',
        });
      } else {
        res.destroy();
      }
    });

    stream.pipe(res);
  });

  // 4.5 Delete Document: DELETE /api/documents/:id
  app.delete('/api/documents/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    try {
      const deleted = repository.deleteTransactional(id, (doc) => {
        storage.deleteSyncIfExists(doc.storedFilename);
      });

      if (!deleted) {
        return res.status(404).json({
          code: 'DOCUMENT_NOT_FOUND',
          message: `Document '${id}' was not found.`,
        });
      }

      return res.status(200).json({
        deleted: true,
        id: deleted.id,
        originalFilename: deleted.originalFilename,
        deletedAt: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete document cleanly.';
      return res.status(500).json({
        code: 'DELETE_FAILED',
        message,
      });
    }
  });

  // Automated test suite trigger endpoint for Workbench UI
  app.post('/api/tests/run', async (_req: Request, res: Response) => {
    if (!options.onRunTests) {
      return res.status(501).json({
        code: 'TESTS_NOT_CONFIGURED',
        message: 'Test runner callback is not configured.',
      });
    }

    try {
      const report = await options.onRunTests();
      return res.status(200).json(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Test suite execution failed.';
      return res.status(500).json({
        code: 'TEST_RUNNER_ERROR',
        message,
      });
    }
  });

  // ASP.NET Core C# Reference Solution Browser
  app.get('/api/dotnet/files', (_req: Request, res: Response) => {
    const dotnetRoot = options.dotnetDir ?? path.resolve(process.cwd(), 'dotnet');
    const files = collectDotnetFiles(dotnetRoot);
    res.json({
      rootName: 'DocumentManagement_LastName_FirstName',
      files,
    });
  });

  // Fallback error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Unexpected server error.';
    res.status(500).json({
      code: 'INTERNAL_SERVER_ERROR',
      message,
    });
  });

  return {
    app,
    repository,
    storage,
    close: () => repository.close(),
  };
}
