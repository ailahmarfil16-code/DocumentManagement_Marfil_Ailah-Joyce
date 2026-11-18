# Document Management REST API (ASP.NET Core 8 / C#)

## 1. Application Overview
A clean, maintainable RESTful Document Management System API built with **ASP.NET Core 8**, **Entity Framework Core**, and **SQL Server**. Clients can upload documents (`multipart/form-data`), list stored document metadata, inspect individual document details, download physical files, and safely delete documents along with their stored files.

## 2. Prerequisites
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- Microsoft SQL Server (LocalDB, SQL Server Express, or Docker SQL Server)
- Optional: `dotnet-ef` CLI (`dotnet tool install --global dotnet-ef`)

## 3. Database Configuration & Setup
1. Review `DocumentManagement.Api/appsettings.json`. By default it targets LocalDB (`Server=(localdb)\\mssqllocaldb;Database=DocumentManagementDb;Trusted_Connection=True`).
2. Do **not** commit production passwords or secret connection strings. Use `dotnet user-secrets` or environment variables (`ConnectionStrings__DefaultConnection`) for credentials.
3. Run the schema script in `sql/schema.sql` against your SQL Server instance, or apply EF Core migrations:
   ```bash
   cd DocumentManagement.Api
   dotnet ef migrations add InitialCreate
   dotnet ef database update
   ```

## 4. Running the Application
```bash
cd DocumentManagement.Api
dotnet restore
dotnet run
```
Swagger UI is enabled in Development mode at `https://localhost:5001/swagger` (or the HTTP port printed by Kestrel).

## 5. Running Automated Tests
The xUnit integration test suite (`DocumentManagement.Tests`) uses `WebApplicationFactory<Program>`, an isolated in-memory SQLite relational database, and an isolated temporary storage directory:
```bash
cd DocumentManagement.Tests
dotnet test
```

## 6. Implemented Endpoints
| Method | Route | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/documents` | Upload a document (`multipart/form-data`, field `file`, max 10 MB) | `201`, `400`, `413`, `415` |
| `GET` | `/api/documents` | List metadata of all documents (no file bytes) | `200` |
| `GET` | `/api/documents/{id}` | Retrieve metadata for a specific document UUID | `200`, `404` |
| `GET` | `/api/documents/{id}/download` | Stream stored file bytes with `Content-Disposition` | `200`, `404` |
| `DELETE` | `/api/documents/{id}` | Delete metadata and physical file transactionally | `200`, `404`, `500` |

## 7. Architecture, Data Access & File Storage Decisions
- **Architecture**: Lightweight Controller -> DbContext + `IDocumentStorageService` separation. Easy to navigate and appropriate for the scope without unnecessary mediator/CQRS boilerplate.
- **Data Access**: Entity Framework Core with explicit column constraints (`[MaxLength]`, unique index on `StoredFilename`, `UploadedAt` index) and `AsNoTracking()` for read queries.
- **File Storage & Security**:
  - Physical files are never written using user-supplied filenames. Each document receives a `Guid` identifier and is saved as `<Guid><validated_extension>` inside a configured root directory.
  - `ResolveSafePath` verifies canonicalized paths (`Path.GetFullPath`) remain strictly inside `_storageRoot` to block path traversal (`../`).
  - Uploads write to a `.tmp` file first and atomically `File.Move` to final path; if database persistence fails, the orphaned file is cleaned up immediately.
  - Deletions wrap `DbContext.SaveChangesAsync()` and physical `File.Delete()` inside an explicit database transaction (`BeginTransactionAsync`) so failed disk deletes roll back the database row deletion.

## 8. Assumptions & Limitations
- **Allowed File Types**: `.pdf`, `.txt`, `.csv`, `.md`, `.json`, `.xml`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.zip`. Executables/scripts (`.exe`, `.bat`, `.sh`, `.ps1`, `.js`, etc.) are blocked (`415 Unsupported Media Type`).
- **Max Upload Size**: Enforced at 10 MB (`10,485,760` bytes) at both Kestrel/form limits and service validation.
- **Authentication**: Excluded per assessment instructions.
- **Storage Backend**: Local disk storage assumes single-instance deployment; scaling to multiple instances would swap `IDocumentStorageService` for Azure Blob Storage or Amazon S3.

## 9. AI-Assisted Development Disclosure
- **Tools Used**: AI-assisted code generation and review tools were used to scaffold boilerplate project files, xUnit integration tests, and documentation structure.
- **Usage**: Used to accelerate initial scaffolding of the controller, storage path-traversal checks, and test fixtures.
- **Reviewed & Modified**: File validation rules (MIME fallback vs. strict extension allowlist), atomic temp-file writes, and transactional rollback semantics on `DELETE` were explicitly designed and reviewed to prevent orphaned files or inconsistent records.
- **Least Confident Area**: Multi-instance file locking behavior under concurrent `DELETE` + `GET /download` requests on Windows NTFS vs. Linux filesystems, which would be hardened in production with distributed locks or object storage versioning.
