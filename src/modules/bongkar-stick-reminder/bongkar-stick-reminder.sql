/* Modul Bongkar Stick Reminder — jalankan manual, aman dijalankan ulang. */

/* Threshold umur (hari sejak KD_h.TglKeluar). Satu baris saja (Id = 1). */
IF OBJECT_ID('dbo.BongkarStickReminderSetting', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.BongkarStickReminderSetting (
    Id           INT          NOT NULL CONSTRAINT PK_BongkarStickReminderSetting PRIMARY KEY
                              CONSTRAINT CK_BongkarStickReminderSetting_Id CHECK (Id = 1),
    WarningDays  INT          NOT NULL CONSTRAINT DF_BSRS_Warning DEFAULT 30,
    CriticalDays INT          NOT NULL CONSTRAINT DF_BSRS_Critical DEFAULT 37,
    UpdatedBy    VARCHAR(50)  NULL,
    UpdatedAt    DATETIME     NULL
  );
  INSERT INTO dbo.BongkarStickReminderSetting (Id, WarningDays, CriticalDays) VALUES (1, 30, 37);
END;

/* Penanda per label ST: akan dipakai atau tidak (penanda saja). */
IF OBJECT_ID('dbo.BongkarStickReminderFlag', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.BongkarStickReminderFlag (
    NoST            VARCHAR(50)  NOT NULL CONSTRAINT PK_BongkarStickReminderFlag PRIMARY KEY,
    IsGoingToBeUsed BIT          NOT NULL CONSTRAINT DF_BSRF_Flag DEFAULT 0,
    UpdatedBy       VARCHAR(50)  NULL,
    UpdatedAt       DATETIME     NULL
  );
END;
