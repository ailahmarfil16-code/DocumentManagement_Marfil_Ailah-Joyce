-- SQL Server schema setup script for DocumentManagementDb
IF DB_ID(N'DocumentManagementDb') IS NULL
BEGIN
    CREATE DATABASE DocumentManagementDb;
END;
GO

USE DocumentManagementDb;
GO

IF OBJECT_ID(N'dbo.Documents', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Documents (
        Id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Documents PRIMARY KEY,
        OriginalFilename NVARCHAR(255) NOT NULL,
        StoredFilename NVARCHAR(255) NOT NULL,
        ContentType NVARCHAR(150) NOT NULL,
        FileSize BIGINT NOT NULL CONSTRAINT CK_Documents_FileSize CHECK (FileSize > 0),
        UploadedAt DATETIMEOFFSET(7) NOT NULL
    );

    CREATE UNIQUE INDEX IX_Documents_StoredFilename ON dbo.Documents (StoredFilename);
    CREATE INDEX IX_Documents_UploadedAt ON dbo.Documents (UploadedAt DESC);
END;
GO
