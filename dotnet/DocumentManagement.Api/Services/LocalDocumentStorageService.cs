namespace DocumentManagement.Api.Services;

public class LocalDocumentStorageService : IDocumentStorageService
{
    private static readonly Dictionary<string, string[]> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        [".pdf"] = ["application/pdf"],
        [".txt"] = ["text/plain"],
        [".csv"] = ["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"],
        [".md"] = ["text/markdown", "text/plain", "text/x-markdown"],
        [".json"] = ["application/json", "text/json", "text/plain"],
        [".xml"] = ["application/xml", "text/xml"],
        [".doc"] = ["application/msword"],
        [".docx"] = ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        [".xls"] = ["application/vnd.ms-excel"],
        [".xlsx"] = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
        [".ppt"] = ["application/vnd.ms-powerpoint"],
        [".pptx"] = ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
        [".png"] = ["image/png"],
        [".jpg"] = ["image/jpeg"],
        [".jpeg"] = ["image/jpeg"],
        [".gif"] = ["image/gif"],
        [".webp"] = ["image/webp"],
        [".zip"] = ["application/zip", "application/x-zip-compressed"]
    };

    private static readonly HashSet<string> BlockedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".exe", ".dll", ".bat", ".cmd", ".sh", ".ps1", ".msi", ".vbs", ".js", ".php", ".py", ".jar"
    };

    private readonly string _storageRoot;

    public long MaxFileSizeBytes { get; }

    public LocalDocumentStorageService(IConfiguration configuration, IHostEnvironment environment)
    {
        var configuredRoot = configuration["DocumentStorage:RootPath"] ?? "Storage/Documents";
        _storageRoot = Path.GetFullPath(
            Path.IsPathRooted(configuredRoot)
                ? configuredRoot
                : Path.Combine(environment.ContentRootPath, configuredRoot));

        MaxFileSizeBytes = configuration.GetValue<long?>("DocumentStorage:MaxFileSizeBytes") ?? 10 * 1024 * 1024;
        Directory.CreateDirectory(_storageRoot);
    }

    public (bool IsValid, string? ErrorCode, string? ErrorMessage) ValidateFile(IFormFile? file)
    {
        if (file is null)
        {
            return (false, "MISSING_FILE", "A multipart/form-data file field named 'file' is required.");
        }

        if (file.Length <= 0)
        {
            return (false, "EMPTY_FILE", "Uploaded file cannot be empty (0 bytes).");
        }

        if (file.Length > MaxFileSizeBytes)
        {
            return (false, "FILE_TOO_LARGE", $"File exceeds maximum allowed size of {MaxFileSizeBytes / (1024 * 1024)} MB.");
        }

        var sanitizedName = SanitizeOriginalFilename(file.FileName);
        var ext = Path.GetExtension(sanitizedName);

        if (string.IsNullOrWhiteSpace(ext))
        {
            return (false, "MISSING_EXTENSION", "Uploaded file must include a recognized file extension.");
        }

        if (BlockedExtensions.Contains(ext))
        {
            return (false, "BLOCKED_FILE_TYPE", $"Executable or script extension '{ext}' is not permitted.");
        }

        if (!AllowedExtensions.TryGetValue(ext, out var allowedMimes))
        {
            return (false, "UNSUPPORTED_FILE_TYPE", $"File extension '{ext}' is not supported.");
        }

        var contentType = (file.ContentType ?? string.Empty).Split(';')[0].Trim();
        var isGenericBinary = string.IsNullOrEmpty(contentType) ||
                              contentType.Equals("application/octet-stream", StringComparison.OrdinalIgnoreCase);

        if (!isGenericBinary && !allowedMimes.Contains(contentType, StringComparer.OrdinalIgnoreCase))
        {
            return (false, "MIME_TYPE_MISMATCH", $"Content type '{contentType}' does not match '{ext}'.");
        }

        return (true, null, null);
    }

    public async Task<StoredFileResult> SaveAsync(Guid documentId, IFormFile file, CancellationToken cancellationToken = default)
    {
        var sanitizedOriginal = SanitizeOriginalFilename(file.FileName);
        var ext = Path.GetExtension(sanitizedOriginal).ToLowerInvariant();
        var storedFilename = $"{documentId:D}{ext}";
        var fullPath = ResolveSafePath(storedFilename);
        var tempPath = $"{fullPath}.{Guid.NewGuid():N}.tmp";

        try
        {
            await using (var stream = new FileStream(tempPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, useAsync: true))
            {
                await file.CopyToAsync(stream, cancellationToken);
            }

            File.Move(tempPath, fullPath, overwrite: false);
            return new StoredFileResult(storedFilename, sanitizedOriginal);
        }
        catch
        {
            if (File.Exists(tempPath))
            {
                File.Delete(tempPath);
            }
            throw;
        }
    }

    public Stream? OpenReadStream(string storedFilename)
    {
        var fullPath = ResolveSafePath(storedFilename);
        if (!File.Exists(fullPath))
        {
            return null;
        }

        return new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
    }

    public Task DeleteAsync(string storedFilename, CancellationToken cancellationToken = default)
    {
        var fullPath = ResolveSafePath(storedFilename);
        if (File.Exists(fullPath))
        {
            File.Delete(fullPath);
        }

        return Task.CompletedTask;
    }

    private string ResolveSafePath(string storedFilename)
    {
        if (string.IsNullOrWhiteSpace(storedFilename) ||
            storedFilename.Contains("..") ||
            storedFilename.Contains('/') ||
            storedFilename.Contains('\\'))
        {
            throw new InvalidOperationException("Invalid stored filename detected.");
        }

        var combined = Path.GetFullPath(Path.Combine(_storageRoot, storedFilename));
        var normalizedRoot = _storageRoot.EndsWith(Path.DirectorySeparatorChar)
            ? _storageRoot
            : _storageRoot + Path.DirectorySeparatorChar;

        if (!combined.StartsWith(normalizedRoot, StringComparison.Ordinal))
        {
            throw new UnauthorizedAccessException("Resolved storage path escapes configured root directory.");
        }

        return combined;
    }

    private static string SanitizeOriginalFilename(string rawFilename)
    {
        var fileNameOnly = Path.GetFileName(rawFilename.Replace('\\', '/'));
        var invalidChars = Path.GetInvalidFileNameChars();
        var cleaned = new string(fileNameOnly.Select(c => invalidChars.Contains(c) || char.IsControl(c) ? '_' : c).ToArray()).Trim();
        return string.IsNullOrWhiteSpace(cleaned) ? "unnamed_document" : cleaned[..Math.Min(cleaned.Length, 255)];
    }
}
