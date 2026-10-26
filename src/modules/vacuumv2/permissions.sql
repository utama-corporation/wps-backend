-- Permission Vacuum V2 (menggantikan pengecekan hardcode grup 27).
DECLARE @Perm TABLE (NoPermission VARCHAR(100), Permission VARCHAR(50));
INSERT INTO @Perm VALUES
  ('vacuum_v2:create', 'Create Vacuum V2'),
  ('vacuum_v2:read',   'Read Vacuum V2'),
  ('vacuum_v2:update', 'Update Vacuum V2'),
  ('vacuum_v2:delete', 'Delete Vacuum V2');

INSERT INTO dbo.MstPermissionList (NoPermission, Permission)
SELECT p.NoPermission, p.Permission FROM @Perm p
WHERE NOT EXISTS (SELECT 1 FROM dbo.MstPermissionList x WHERE x.NoPermission = p.NoPermission);

-- Pertahankan akses lama: semua grup boleh lihat & tambah (sebelumnya semua user login),
-- hanya grup 27 yang boleh ubah & hapus. Cabut dari grup yang tidak seharusnya lewat menu Role.
INSERT INTO dbo.MstUserGroupPermission (IdUGroup, NoPermission, Allow)
SELECT g.IdUGroup, p.NoPermission, 1
FROM dbo.MstUserGroup g
CROSS JOIN @Perm p
WHERE (p.NoPermission IN ('vacuum_v2:read', 'vacuum_v2:create') OR g.IdUGroup = 27)
  AND NOT EXISTS (
    SELECT 1 FROM dbo.MstUserGroupPermission x
    WHERE x.IdUGroup = g.IdUGroup AND x.NoPermission = p.NoPermission
  );
