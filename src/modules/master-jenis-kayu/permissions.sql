/* Daftarkan permission Master Jenis Kayu, User, dan Role, lalu beri ke grup tertentu.
 * 1) Insert ke MstPermissionList (agar muncul di halaman Role).
 * 2) Insert ke MstUserGroupPermission untuk grup @GroupName (default: Admin).
 * Aman dijalankan ulang. Super admin ('*') tidak perlu. */
DECLARE @GroupName NVARCHAR(25) = N'Admin'; -- <-- ganti bila perlu

DECLARE @Perm TABLE (NoPermission VARCHAR(100), Permission VARCHAR(50));
INSERT INTO @Perm VALUES
  ('datamaster_jeniskayu:create', 'Create Master Jenis Kayu'),
  ('datamaster_jeniskayu:read',   'Read Master Jenis Kayu'),
  ('datamaster_jeniskayu:update', 'Update Master Jenis Kayu'),
  ('datamaster_jeniskayu:delete', 'Delete Master Jenis Kayu'),
  ('datamasterpermissiongroup:create', 'Create Master Role'),
  ('datamasterpermissiongroup:read',   'Read Master Role'),
  ('datamasterpermissiongroup:update', 'Update Master Role'),
  ('datamasterpermissiongroup:delete', 'Delete Master Role');

INSERT INTO dbo.MstPermissionList (NoPermission, Permission)
SELECT p.NoPermission, p.Permission FROM @Perm p
WHERE NOT EXISTS (SELECT 1 FROM dbo.MstPermissionList x WHERE x.NoPermission = p.NoPermission);

DECLARE @IdUGroup INT = (SELECT TOP 1 IdUGroup FROM dbo.MstUserGroup WHERE UGroupName = @GroupName);
IF @IdUGroup IS NULL
  RAISERROR('Grup tidak ditemukan', 16, 1);
ELSE
  INSERT INTO dbo.MstUserGroupPermission (IdUGroup, NoPermission, Allow)
  SELECT @IdUGroup, p.NoPermission, 1 FROM @Perm p
  WHERE NOT EXISTS (
    SELECT 1 FROM dbo.MstUserGroupPermission x
    WHERE x.IdUGroup = @IdUGroup AND x.NoPermission = p.NoPermission
  );
