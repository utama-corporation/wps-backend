/* Template filter + kolom Daftar Label per user (WPS Web).
 * Filters / Columns : JSON (filter multi-nilai & daftar kolom tampil)
 * Nama unik per user. Aman dijalankan ulang. */
IF OBJECT_ID('dbo.MstUserLabelListTemplate', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.MstUserLabelListTemplate (
    Id         INT IDENTITY(1,1) NOT NULL,
    IdUsername INT            NOT NULL,
    Nama       NVARCHAR(100)  NOT NULL,
    Filters    NVARCHAR(MAX)  NOT NULL,
    Columns    NVARCHAR(MAX)  NOT NULL,
    DateCreate DATETIME       NOT NULL CONSTRAINT DF_MstUserLabelListTemplate_DateCreate DEFAULT (GETDATE()),
    DateUpdate DATETIME       NULL,
    CONSTRAINT PK_MstUserLabelListTemplate PRIMARY KEY (Id),
    CONSTRAINT UQ_MstUserLabelListTemplate_User_Nama UNIQUE (IdUsername, Nama)
  );
END
