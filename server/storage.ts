import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.txt': ['text/plain'],
  '.csv': ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'],
  '.md': ['text/markdown', 'text/plain', 'text/x-markdown'],
  '.json': ['application/json', 'text/json', 'text/plain'],
  '.xml': ['application/xml', 'text/xml'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.ppt': ['application/vnd.ms-powerpoint'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.gif': ['image/gif'],
  '.webp': ['image/webp'],
  '.zip': ['application/zip', 'application/x-zip-compressed'],
};

export const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.dll',
  '.bat',
  '.cmd',
  '.sh',
  '.ps1',
  '.msi',
  '.vbs',
  '.js',
  '.mjs',
  '.cjs',
  '.php',
  '.py',
  '.rb',
  '.jar',
]);

export interface FileValidationError {
  status: number;
  code: string;
  message: string;
}

export function sanitizeOriginalFilename(rawName: string): string {
  // Strip any directory paths (Unix or Windows) and control characters
  const normalized = rawName.replace(/\\/g, '/');
  const baseName = path.posix.basename(normalized);
  const cleaned = baseName.replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '_').trim();
  return cleaned.length > 0 ? cleaned.slice(0, 255) : 'unnamed_document';
}

export function validateUploadedFile(
  originalName: string,
  mimeType: string,
  size: number,
): FileValidationError | null {
  if (!originalName || originalName.trim().length === 0) {
    return {
      status: 400,
      code: 'INVALID_FILENAME',
      message: 'Uploaded file must include a valid filename.',
    };
  }

  if (size <= 0) {
    return {
      status: 400,
      code: 'EMPTY_FILE',
      message: 'Uploaded file cannot be empty (0 bytes).',
    };
  }

  if (size > MAX_FILE_SIZE_BYTES) {
    return {
      status: 413,
      code: 'FILE_TOO_LARGE',
      message: `File exceeds the maximum allowed size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`,
    };
  }

  const sanitized = sanitizeOriginalFilename(originalName);
  const ext = path.extname(sanitized).toLowerCase();

  if (!ext) {
    return {
      status: 415,
      code: 'MISSING_EXTENSION',
      message: 'File must have a recognized extension (e.g., .pdf, .txt, .docx, .png).',
    };
  }

  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      status: 415,
      code: 'BLOCKED_FILE_TYPE',
      message: `Executable or script file type '${ext}' is not permitted.`,
    };
  }

  const allowedMimes = ALLOWED_EXTENSIONS[ext];
  if (!allowedMimes) {
    return {
      status: 415,
      code: 'UNSUPPORTED_FILE_TYPE',
      message: `File extension '${ext}' is not in the supported allowlist.`,
    };
  }

  const normalizedMime = (mimeType || '').split(';')[0].trim().toLowerCase();
  const isGenericBinaryFallback =
    normalizedMime === 'application/octet-stream' || normalizedMime === '';

  if (!isGenericBinaryFallback && !allowedMimes.includes(normalizedMime)) {
    return {
      status: 415,
      code: 'MIME_TYPE_MISMATCH',
      message: `Content type '${normalizedMime}' does not match expected types for '${ext}'.`,
    };
  }

  return null;
}

export class LocalDocumentStorage {
  public readonly rootDir: string;

  constructor(storageDir: string) {
    this.rootDir = path.resolve(storageDir);
    fs.mkdirSync(this.rootDir, { recursive: true });
  }

  public resolveSafePath(storedFilename: string): string {
    if (
      !storedFilename ||
      storedFilename.includes('/') ||
      storedFilename.includes('\\') ||
      storedFilename.includes('..')
    ) {
      throw new Error('Invalid stored filename.');
    }

    const resolved = path.resolve(this.rootDir, storedFilename);
    const prefix = this.rootDir.endsWith(path.sep) ? this.rootDir : this.rootDir + path.sep;
    if (!resolved.startsWith(prefix)) {
      throw new Error('Resolved path escapes configured storage root.');
    }
    return resolved;
  }

  public buildStoredFilename(documentId: string, originalFilename: string): string {
    const safeName = sanitizeOriginalFilename(originalFilename);
    const ext = path.extname(safeName).toLowerCase();
    const safeExt = ext && ALLOWED_EXTENSIONS[ext] ? ext : '';
    return `${documentId}${safeExt}`;
  }

  public generateDocumentId(): string {
    return randomUUID();
  }

  public async saveBuffer(storedFilename: string, buffer: Buffer): Promise<string> {
    const targetPath = this.resolveSafePath(storedFilename);
    const tempPath = `${targetPath}.${randomUUID()}.tmp`;
    await fs.promises.writeFile(tempPath, buffer);
    await fs.promises.rename(tempPath, targetPath);
    return targetPath;
  }

  public async exists(storedFilename: string): Promise<boolean> {
    try {
      const targetPath = this.resolveSafePath(storedFilename);
      await fs.promises.access(targetPath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  public createReadStream(storedFilename: string): fs.ReadStream {
    const targetPath = this.resolveSafePath(storedFilename);
    return fs.createReadStream(targetPath);
  }

  public deleteSyncIfExists(storedFilename: string): void {
    const targetPath = this.resolveSafePath(storedFilename);
    try {
      fs.unlinkSync(targetPath);
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  public async deleteIfExists(storedFilename: string): Promise<void> {
    const targetPath = this.resolveSafePath(storedFilename);
    try {
      await fs.promises.unlink(targetPath);
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code !== 'ENOENT') {
        throw err;
      }
    }
  }
}
