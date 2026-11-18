using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using DocumentManagement.Api.Data;
using DocumentManagement.Api.Models;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace DocumentManagement.Tests;

public class DocumentApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    public string TempStoragePath { get; } = Path.Combine(Path.GetTempPath(), $"docmgmt_tests_{Guid.NewGuid():N}");

    public async Task InitializeAsync()
    {
        await _connection.OpenAsync();
        Directory.CreateDirectory(TempStoragePath);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("DocumentStorage:RootPath", TempStoragePath);
        builder.UseSetting("DocumentStorage:MaxFileSizeBytes", "10485760");

        builder.ConfigureServices(services =>
        {
            var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<DocumentDbContext>));
            if (descriptor is not null)
            {
                services.Remove(descriptor);
            }

            services.AddDbContext<DocumentDbContext>(options => options.UseSqlite(_connection));

            using var sp = services.BuildServiceProvider();
            using var scope = sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<DocumentDbContext>();
            db.Database.EnsureCreated();
        });
    }

    public new async Task DisposeAsync()
    {
        await _connection.DisposeAsync();
        if (Directory.Exists(TempStoragePath))
        {
            Directory.Delete(TempStoragePath, recursive: true);
        }
        await base.DisposeAsync();
    }
}

public class DocumentsControllerTests : IClassFixture<DocumentApiFactory>
{
    private readonly DocumentApiFactory _factory;
    private readonly HttpClient _client;

    public DocumentsControllerTests(DocumentApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    private static MultipartFormDataContent CreateFileContent(byte[] bytes, string fileName, string contentType)
    {
        var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(bytes);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(fileContent, "file", fileName);
        return form;
    }

    [Fact]
    public async Task UploadDocument_ValidFile_ReturnsCreatedWithMetadataAndPersistsFile()
    {
        var payload = Encoding.UTF8.GetBytes("Audit workpaper summary 2026.");
        using var form = CreateFileContent(payload, "workpaper-2026.txt", "text/plain");

        var response = await _client.PostAsync("/api/documents", form);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var doc = await response.Content.ReadFromJsonAsync<DocumentMetadataDto>();
        Assert.NotNull(doc);
        Assert.NotEqual(Guid.Empty, doc!.Id);
        Assert.Equal("workpaper-2026.txt", doc.OriginalFilename);
        Assert.Equal(payload.Length, doc.FileSize);
        Assert.True(File.Exists(Path.Combine(_factory.TempStoragePath, doc.StoredFilename)));
    }

    [Fact]
    public async Task GetDocumentById_ExistingDocument_ReturnsMetadata()
    {
        var payload = Encoding.UTF8.GetBytes("Metadata check content");
        using var form = CreateFileContent(payload, "check.txt", "text/plain");
        var createRes = await _client.PostAsync("/api/documents", form);
        var created = await createRes.Content.ReadFromJsonAsync<DocumentMetadataDto>();

        var getRes = await _client.GetAsync($"/api/documents/{created!.Id}");

        Assert.Equal(HttpStatusCode.OK, getRes.StatusCode);
        var fetched = await getRes.Content.ReadFromJsonAsync<DocumentMetadataDto>();
        Assert.Equal(created.Id, fetched!.Id);
        Assert.Equal("check.txt", fetched.OriginalFilename);
    }

    [Fact]
    public async Task GetDocumentById_NonexistentDocument_ReturnsNotFound()
    {
        var missingId = Guid.NewGuid();
        var response = await _client.GetAsync($"/api/documents/{missingId}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task UploadDocument_Exceeding10MbLimit_ReturnsPayloadTooLarge()
    {
        var oversized = new byte[10 * 1024 * 1024 + 1024];
        using var form = CreateFileContent(oversized, "oversized.pdf", "application/pdf");

        var response = await _client.PostAsync("/api/documents", form);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
    }

    [Fact]
    public async Task UploadDocument_BlockedExecutableExtension_ReturnsUnsupportedMediaType()
    {
        var bytes = Encoding.UTF8.GetBytes("MZ fake exe");
        using var form = CreateFileContent(bytes, "installer.exe", "application/octet-stream");

        var response = await _client.PostAsync("/api/documents", form);

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode);
    }

    [Fact]
    public async Task DeleteDocument_ExistingDocument_RemovesRecordAndStoredFile()
    {
        var payload = Encoding.UTF8.GetBytes("File scheduled for deletion");
        using var form = CreateFileContent(payload, "delete-me.txt", "text/plain");
        var createRes = await _client.PostAsync("/api/documents", form);
        var created = await createRes.Content.ReadFromJsonAsync<DocumentMetadataDto>();

        var deleteRes = await _client.DeleteAsync($"/api/documents/{created!.Id}");
        Assert.Equal(HttpStatusCode.OK, deleteRes.StatusCode);

        var verifyGet = await _client.GetAsync($"/api/documents/{created.Id}");
        Assert.Equal(HttpStatusCode.NotFound, verifyGet.StatusCode);
        Assert.False(File.Exists(Path.Combine(_factory.TempStoragePath, created.StoredFilename)));
    }
}
