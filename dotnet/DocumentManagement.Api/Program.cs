using DocumentManagement.Api.Data;
using DocumentManagement.Api.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddDbContext<DocumentDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddScoped<IDocumentStorageService, LocalDocumentStorageService>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.Use(async (context, next) =>
{
    const long transportLimitBytes = 15 * 1024 * 1024;
    if (context.Request.ContentLength is > transportLimitBytes)
    {
        context.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
        await context.Response.WriteAsJsonAsync(new
        {
            code = "FILE_TOO_LARGE",
            message = "File exceeds maximum allowed size of 10 MB."
        });
        return;
    }

    try
    {
        await next();
    }
    catch (BadHttpRequestException ex) when (ex.StatusCode == StatusCodes.Status413PayloadTooLarge)
    {
        if (!context.Response.HasStarted)
        {
            context.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
            await context.Response.WriteAsJsonAsync(new
            {
                code = "FILE_TOO_LARGE",
                message = "File exceeds maximum allowed size of 10 MB."
            });
        }
    }
});

app.MapControllers();

app.Run();

public partial class Program { }
