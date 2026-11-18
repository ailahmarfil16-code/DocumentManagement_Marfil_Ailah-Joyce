import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export interface DocumentRecord {
  id: string;
  originalFilename: string;
  storedFilename: string;
  contentType: string;
  fileSize: number;
  uploadedAt: string;
}

interface DocumentRow {
  id: string;
  original_filename: string;
  stored_filename: string;
  content_type: string;
  file_size: number;
  uploaded_at: string;
}

function mapRow(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    originalFilename: row.original_filename,
    storedFilename: row.stored_filename,
    contentType: row.content_type,
    fileSize: row.file_size,
    uploadedAt: row.uploaded_at,
  };
}

export class DocumentRepository {
  public readonly db: Database.Database;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY NOT NULL,
        original_filename TEXT NOT NULL,
        stored_filename TEXT NOT NULL UNIQUE,
        content_type TEXT NOT NULL,
        file_size INTEGER NOT NULL CHECK (file_size > 0),
        uploaded_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at
        ON documents (uploaded_at DESC);
    `);
  }

  public insert(doc: DocumentRecord): DocumentRecord {
    const stmt = this.db.prepare(`
      INSERT INTO documents (
        id,
        original_filename,
        stored_filename,
        content_type,
        file_size,
        uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      doc.id,
      doc.originalFilename,
      doc.storedFilename,
      doc.contentType,
      doc.fileSize,
      doc.uploadedAt,
    );

    return doc;
  }

  public listAll(): DocumentRecord[] {
    const stmt = this.db.prepare(`
      SELECT
        id,
        original_filename,
        stored_filename,
        content_type,
        file_size,
        uploaded_at
      FROM documents
      ORDER BY uploaded_at DESC
    `);

    const rows = stmt.all() as DocumentRow[];
    return rows.map(mapRow);
  }

  public getById(id: string): DocumentRecord | null {
    const stmt = this.db.prepare(`
      SELECT
        id,
        original_filename,
        stored_filename,
        content_type,
        file_size,
        uploaded_at
      FROM documents
      WHERE id = ?
    `);

    const row = stmt.get(id) as DocumentRow | undefined;
    return row ? mapRow(row) : null;
  }

  /**
   * Executes database deletion inside an immediate transaction paired with a
   * physical file removal callback. If physical deletion throws (e.g., permission
   * error), SQLite automatically rolls back the DELETE so database and disk
   * never drift into an inconsistent state.
   */
  public deleteTransactional(id: string, onBeforeCommitFileDelete: (doc: DocumentRecord) => void): DocumentRecord | null {
    const tx = this.db.transaction((docId: string): DocumentRecord | null => {
      const existing = this.getById(docId);
      if (!existing) {
        return null;
      }

      const deleteStmt = this.db.prepare('DELETE FROM documents WHERE id = ?');
      const info = deleteStmt.run(docId);
      if (info.changes === 0) {
        return null;
      }

      onBeforeCommitFileDelete(existing);
      return existing;
    });

    return tx.immediate(id);
  }

  public close(): void {
    this.db.close();
  }
}
