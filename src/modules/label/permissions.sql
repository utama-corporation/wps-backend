/* Daftarkan permission "Reset Cetak" (reset HasBeenPrinted) semua label, lalu beri ke grup @GroupName.
 * Label dibatasi maksimal 2x cetak; hanya pemegang permission ini yang bisa mereset.
 * Aman dijalankan ulang. Super admin ('*') tidak perlu. */
DECLARE @GroupName NVARCHAR(25) = N'Admin'; -- <-- ganti bila perlu

DECLARE @Perm TABLE (NoPermission VARCHAR(100), Permission VARCHAR(50));
INSERT INTO @Perm VALUES
  ('label_st:reset_print',   'Reset Cetak Label ST'),
  ('label_s4s:reset_print',  'Reset Cetak Label S4S'),
  ('label_fj:reset_print',   'Reset Cetak Label FJ'),
  ('label_mld:reset_print',  'Reset Cetak Label Moulding'),
  ('label_lmt:reset_print',  'Reset Cetak Label Laminating'),
  ('label_cca:reset_print',  'Reset Cetak Label CCA'),
  ('label_snd:reset_print',  'Reset Cetak Label Sanding'),
  ('label_bj:reset_print',   'Reset Cetak Label Barang Jadi');

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
