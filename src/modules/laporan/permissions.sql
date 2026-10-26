DECLARE @GroupName NVARCHAR(25) = N'Admin'; -- ganti bila perlu

DECLARE @Perm TABLE (NoPermission VARCHAR(100), Permission VARCHAR(50));
INSERT INTO @Perm VALUES
  ('laporan:kb:read',          'Read Laporan Kayu Bulat (KB)'),
  ('laporan:kg:read',          'Read Laporan Kayu Bulat Rambung (KG)'),
  ('laporan:st:read',          'Read Laporan Sawn Timber (ST)'),
  ('laporan:qc-sawmill:read',  'Read Laporan QC Sawmill'),
  ('laporan:s4s:read',         'Read Laporan S4S'),
  ('laporan:fj:read',          'Read Laporan Finger Joint (FJ)'),
  ('laporan:moulding:read',    'Read Laporan Moulding'),
  ('laporan:laminating:read',  'Read Laporan Laminating'),
  ('laporan:cca:read',         'Read Laporan Cross Cut Akhir'),
  ('laporan:sanding:read',     'Read Laporan Sanding'),
  ('laporan:reproses:read',    'Read Laporan Reproses'),
  ('laporan:bj:read',          'Read Laporan Barang Jadi (BJ)'),
  ('laporan:rendemen:read',    'Read Laporan Rendemen Kayu'),
  ('laporan:penjualan:read',   'Read Laporan Penjualan Kayu'),
  ('laporan:management:read',  'Read Laporan Management'),
  ('laporan:verifikasi:read',  'Read Laporan Verifikasi');

INSERT INTO dbo.MstPermissionList (NoPermission, Permission)
SELECT p.NoPermission, p.Permission FROM @Perm p
WHERE NOT EXISTS (SELECT 1 FROM dbo.MstPermissionList x WHERE x.NoPermission = p.NoPermission);

-- Grant default: hanya grup akses-umum laporan (sisanya assign via UI Role).
DECLARE @Grup TABLE (UGroupName NVARCHAR(25));
INSERT INTO @Grup VALUES ('Admin'), ('PowerUser'), ('Supervisor'), ('Laporan');

INSERT INTO dbo.MstUserGroupPermission (IdUGroup, NoPermission, Allow)
SELECT ug.IdUGroup, p.NoPermission, 1
FROM @Grup gr
JOIN dbo.MstUserGroup ug ON ug.UGroupName = gr.UGroupName
CROSS JOIN @Perm p
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.MstUserGroupPermission gp
  WHERE gp.IdUGroup = ug.IdUGroup AND gp.NoPermission = p.NoPermission
);
