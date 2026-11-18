using DocumentManagement.Api.Data;
using DocumentManagement.Api.Models;
using DocumentManagement.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DocumentManagement.Api.Controllers;

[ApiController]
[Route("api/documents")]
public class DocumentsController : ControllerBase
{
    private readonly DocumentDbContext _dbContext;
    private readonly IDocumentStorageService _storage;
    private readonly ILogger<DocumentsController> _logger;

    public DocumentsController(
        DocumentDbContext dbContext,
        IDocumentStorageService storage,
        ILogger<DocumentsController> logger)
    {
        _dbContext = dbContext;
        _storage = storage;
        _logger = logger;
    }

    [HttpPost]
    [RequestSizeLimit(15 * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 15 * 1024 * 1024)]
    [ProducesResponseType(typeof(DocumentMetadataDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status413PayloadTooLarge)]
    [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status415UnsupportedMediaType)]
    public async Task<IActionResult> UploadDocument([FromForm] IFormFile? file, CancellationToken cancellationToken)
    {
        var (isValid, errorCode, errorMessage) = _storage.ValidateFile(file);
        if (!isValid || file is null)
        {
            var statusCode = errorCode switch
            {
                "FILE_TOO_LARGE" => StatusCodes.Status413PayloadTooLarge,
                "MISSING_EXTENSION" or "BLOCKED_FILE_TYPE" or "UNSUPPORTED_FILE_TYPE" or "MIME_TYPE_MISMATCH"
                    => StatusCodes.Status415UnsupportedMediaType,
                _ => StatusCodes.Status400BadRequest
            };

            return StatusCode(statusCode, new ApiErrorResponse(errorCode ?? "VALIDATION_ERROR", errorMessage ?? "Invalid upload."));
        }

        var documentId = Guid.NewGuid();
        StoredFileResult? stored = null;

        try
        {
            stored = await _storage.SaveAsync(documentId, file, cancellationToken);

            var record = new DocumentRecord
            {
                Id = documentId,
                OriginalFilename = stored.SanitizedOriginalFilename,
                StoredFilename = stored.StoredFilename,
                ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
                FileSize = file.Length,
                UploadedAt = DateTimeOffset.UtcNow
            };

            _dbContext.Documents.Add(record);
            await _dbContext.SaveChangesAsync(cancellationToken);

            var dto = ToDto(record);
            return CreatedAtAction(nameof(GetDocumentById), new { id = record.Id }, dto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to persist uploaded document {DocumentId}", documentId);
            if (stored is not null)
            {
                await SafeDeleteStorageAsync(stored.StoredFilename, cancellationToken);
            }
            return StatusCode(StatusCodes.Status500InternalServerError,
                new ApiErrorResponse("UPLOAD_FAILED", "An error occurred while persisting the document."));
        }
    }

    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<DocumentMetadataDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<DocumentMetadataDto>>> ListDocuments(CancellationToken cancellationToken)
    {
        var items = await _dbContext.Documents
            .AsNoTracking()
            .OrderByDescending(d => d.UploadedAt)
            .Select(d => ToDto(d))
            .ToListAsync(cancellationToken);

        return Ok(items);
    }

    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(DocumentMetadataDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DocumentMetadataDto>> GetDocumentById(Guid id, CancellationToken cancellationToken)
    {
        var record = await _dbContext.Documents
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == id, cancellationToken);

        if (record is null)
        {
            return NotFound(new ApiErrorResponse("DOCUMENT_NOT_FOUND", $"Document '{id}' was not found."));
        }

        return Ok(ToDto(record));
    }

    [HttpGet("{id:guid}/download")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DownloadDocument(Guid id, CancellationToken cancellationToken)
    {
        var record = await _dbContext.Documents
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == id, cancellationToken);

        if (record is null)
        {
            return NotFound(new ApiErrorResponse("DOCUMENT_NOT_FOUND", $"Document '{id}' was not found."));
        }

        var stream = _storage.OpenReadStream(record.StoredFilename);
        if (stream is null)
        {
            return NotFound(new ApiErrorResponse("PHYSICAL_FILE_MISSING",
                $"Metadata exists for '{id}', but the stored physical file could not be located."));
        }

        return File(stream, record.ContentType, record.OriginalFilename);
    }

    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteDocument(Guid id, CancellationToken cancellationToken)
    {
        var record = await _dbContext.Documents.FirstOrDefaultAsync(d => d.Id == id, cancellationToken);
        if (record is null)
        {
            return NotFound(new ApiErrorResponse("DOCUMENT_NOT_FOUND", $"Document '{id}' was not found."));
        }

        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            _dbContext.Documents.Remove(record);
            await _dbContext.SaveChangesAsync(cancellationToken);
            await _storage.DeleteAsync(record.StoredFilename, cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return Ok(new { deleted = true, id = record.Id, originalFilename = record.OriginalFilename });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete document {DocumentId}", id);
            await transaction.RollbackAsync(cancellationToken);
            return StatusCode(StatusCodes.Status500InternalServerError,
                new ApiErrorResponse("DELETE_FAILED", "Unable to delete document cleanly. Transaction rolled back."));
        }
    }

    private async Task SafeDeleteStorageAsync(string storedFilename, CancellationToken cancellationToken)
    {
        try
        {
            await _storage.DeleteAsync(storedFilename, cancellationToken);
        }
        catch (Exception cleanupEx)
        {
            _logger.LogWarning(cleanupEx, "Failed to clean up orphaned file {StoredFilename}", storedFilename);
        }
    }

    private static DocumentMetadataDto ToDto(DocumentRecord record) =>
        new(
            record.Id,
            record.OriginalFilename,
            record.StoredFilename,
            record.ContentType,
            record.FileSize,
            record.UploadedAt);
}
