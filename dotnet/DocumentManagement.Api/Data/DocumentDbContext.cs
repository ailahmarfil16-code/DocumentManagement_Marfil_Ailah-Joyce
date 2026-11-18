using DocumentManagement.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace DocumentManagement.Api.Data;

public class DocumentDbContext : DbContext
{
    public DocumentDbContext(DbContextOptions<DocumentDbContext> options) : base(options)
    {
    }

    public DbSet<DocumentRecord> Documents => Set<DocumentRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<DocumentRecord>(entity =>
        {
            entity.ToTable("Documents");
            entity.HasKey(d => d.Id);
            entity.HasIndex(d => d.StoredFilename).IsUnique();
            entity.HasIndex(d => d.UploadedAt);

            entity.Property(d => d.OriginalFilename).HasMaxLength(255).IsRequired();
            entity.Property(d => d.StoredFilename).HasMaxLength(255).IsRequired();
            entity.Property(d => d.ContentType).HasMaxLength(150).IsRequired();
            entity.Property(d => d.FileSize).IsRequired();
            entity.Property(d => d.UploadedAt).IsRequired();
        });
    }
}
