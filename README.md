# Document Management REST API & Workbench

A complete **Document Management REST API** implementation featuring:
1. **Live REST API & Interactive Workbench** (Express + SQLite relational database + safe local disk storage + React UI on port `3000`).
2. **ASP.NET Core 8 / C# Reference Solution** (`/dotnet`) targeting Microsoft SQL Server & Entity Framework Core with xUnit integration tests, ready to export for GitHub submission (`DocumentManagement_LastName_FirstName`).

---

## 1. Prerequisites & Setup

### Live Web Workbench (Node.js)
- Node.js `>= 20`
- Install dependencies:
  ```bash
  npm install
  ```

### ASP.NET Core 8 Reference Solution (`/dotnet`)
- .NET 8 SDK
- Microsoft SQL Server (LocalDB, SQL Server Express, or Docker)
- Schema setup script available at `dotnet/sql/schema.sql`.

---

## 2. Running the Application

```bash
# Development (Express API + Vite frontend on port 3000)
npm run dev

# Production build & start
npm run build
NODE_ENV=production npm start
```

---

## 3. Running Automated Tests

```bash
# Run the live Express API integration test suite (11 tests)
npm test
```

You can also execute the test suite directly from the **Test Suite** tab in the web interface, or inspect/run the C# xUnit integration tests inside `dotnet/DocumentManagement.Tests` with `dotnet test`.

---

## 4. Implemented Endpoints

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/documents` | Upload a document (`multipart/form-data`, field `file`, max 10 MB) | `201`, `400`, `413`, `415` |
| `GET` | `/api/documents` | List all documents and metadata (excludes file contents) | `200` |
| `GET` | `/api/documents/{id}` | Retrieve metadata for a specific document ID | `200`, `404` |
| `GET` | `/api/documents/{id}/download` | Download stored file bytes with safe `Content-Disposition` | `200`, `404` |
| `DELETE` | `/api/documents/{id}` | Delete database record and stored physical file transactionally | `200`, `404`, `500` |

---

## 5. Architecture, Data Access & File Storage Decisions

- **Relational Persistence**: Document metadata (`id`, `original_filename`, `stored_filename`, `content_type`, `file_size`, `uploaded_at`) is stored in a relational `documents` table (`better-sqlite3` with WAL mode and `CHECK (file_size > 0)` in the live Node API; EF Core + SQL Server `Documents` table in `/dotnet`).
- **Safe File Storage**:
  - User-supplied filenames are **never** used for filesystem paths.
  - Each upload receives a `UUID v4` identifier and is saved inside `storage/documents/` as `<uuid><validated_extension>`, preventing filename collisions and path traversal (`../`).
  - Uploads write to a temporary file first and rename atomically. If database insertion fails, the stored file is immediately removed.
  - Deletions execute inside a database transaction paired with physical file removal (`deleteTransactional`) so failed disk operations roll back the database delete, avoiding inconsistent records or orphaned files.

---

## 6. Assumptions & Limitations

- **Supported File Types**: `.pdf`, `.txt`, `.csv`, `.md`, `.json`, `.xml`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.zip`. Executables and scripts (`.exe`, `.bat`, `.sh`, `.ps1`, `.js`, etc.) are rejected (`415 Unsupported Media Type`).
- **Upload Size Limit**: Strictly capped at **10 MB** (`10,485,760` bytes).
- **Authentication**: Not implemented per assessment specification.
- **Secrets Hygiene**: No credentials, API keys, or production connection strings are committed to the repository.

---

## 7. AI-Assisted Development Disclosure

- **AI Tools Used**: AI-assisted code generation and review tools were used during development.
- **How They Were Used**: Used to scaffold the Express + ASP.NET Core project structures, SQL schema scripts, automated integration test suites, and frontend workbench components.
- **Parts Reviewed & Modified**: File validation rules (MIME fallback handling + extension allowlists), path canonicalization checks, atomic temp-file writes, and transactional rollback semantics on `DELETE` were carefully reviewed and verified against automated tests.
- **Least Confident Area**: Concurrent `DELETE` and `GET /download` behavior across multi-node horizontal deployments, where local disk storage would need to be replaced with shared object storage (Azure Blob / S3) and distributed locking.
