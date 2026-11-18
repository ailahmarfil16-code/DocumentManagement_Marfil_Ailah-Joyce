namespace DocumentManagement.Api.Services;

public record StoredFileResult(string StoredFilename, string SanitizedOriginalFilename);

public interface IDocumentStorageService
{
    long MaxFileSizeBytes { get; }
    (bool IsValid, string? ErrorCode, string? ErrorMessage) ValidateFile(IFormFile? file);
    Task<StoredFileResult> SaveAsync(Guid documentId, IFormFile file, CancellationToken cancellationToken = default);
    Stream? OpenReadStream(string storedFilename);
    Task DeleteAsync(string storedFilename, CancellationToken cancellationToken = default);
}
