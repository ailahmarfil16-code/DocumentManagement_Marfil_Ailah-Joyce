using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace DocumentManagement.Api.Models;

[Table("Documents")]
public class DocumentRecord
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    [MaxLength(255)]
    public string OriginalFilename { get; set; } = string.Empty;

    [Required]
    [MaxLength(255)]
    public string StoredFilename { get; set; } = string.Empty;

    [Required]
    [MaxLength(150)]
    public string ContentType { get; set; } = "application/octet-stream";

    [Required]
    public long FileSize { get; set; }

    [Required]
    public DateTimeOffset UploadedAt { get; set; }
}

public record DocumentMetadataDto(
    Guid Id,
    string OriginalFilename,
    string StoredFilename,
    string ContentType,
    long FileSize,
    DateTimeOffset UploadedAt);

public record ApiErrorResponse(string Code, string Message);
