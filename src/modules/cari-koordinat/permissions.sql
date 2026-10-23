/* Daftarkan permission Cari Koordinat (Operasional), lalu beri ke grup tertentu.
 * 1) Insert ke MstPermissionList (agar muncul di halaman Role).
 * 2) Insert ke MstUserGroupPermission untuk grup @GroupName (default: Admin).
 * Aman dijalankan ulang. Super admin ('*') tidak perlu.
 *   read   = melihat daftar tanah, pemilik, dan persentase
 *   export = mengunduh CSV / GeoJSON */
DECLARE @GroupName NVARCHAR(25) = N'Admin'; -- <-- ganti bila perlu

DECLARE @Perm TABLE (NoPermission VARCHAR(100), Permission VARCHAR(50));
INSERT INTO @Perm VALUES
  ('cari_koordinat:read',   'Read Cari Koordinat'),
  ('cari_koordinat:export', 'Export Cari Koordinat');

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
