const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Bongkar Stick Reminder (modul baru, belum ada padanan desktop).
 * ST hidup (DateUsage NULL) yang masih bersusun stick (IsSticked = 1)
 * dan sudah keluar KD. Umur dihitung dari KD_h.TglKeluar terbaru.
 * Status: >= CriticalDays -> critical, >= WarningDays -> warning.
 * Threshold disimpan di BongkarStickReminderSetting (bukan hardcoded).
 * ==========================================================*/

const DEFAULT_SETTING = { warningDays: 30, criticalDays: 37 };

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function audit(transaction, user, aktivitas) {
  const r = new sql.Request(transaction);
  r.input("nip", sql.VarChar(50), user || "admin");
  r.input("aktivitas", sql.VarChar(500), aktivitas);
  await r.query(`INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas]) VALUES (@nip, GETDATE(), @aktivitas)`);
}

function statusOf(hari, setting) {
  if (hari >= setting.criticalDays) return "critical";
  if (hari >= setting.warningDays) return "warning";
  return "normal";
}

async function getSetting() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT TOP 1 WarningDays, CriticalDays FROM dbo.BongkarStickReminderSetting WHERE Id = 1
  `);
  const row = rs.recordset[0];
  if (!row) return { ...DEFAULT_SETTING };
  return { warningDays: row.WarningDays, criticalDays: row.CriticalDays };
}

async function getList() {
  const pool = await poolPromise;
  const setting = await getSetting();

  /* Satu baris per NoST. TglKeluar terbaru bila ST pernah masuk KD > 1x. */
  const rs = await pool.request().query(`
    SELECT
      h.NoST,
      k.Jenis AS JenisKayu,
      h.DateCreate,
      kd.TglKeluar,
      DATEDIFF(DAY, kd.TglKeluar, GETDATE()) AS SudahBerapaHari,
      ISNULL(d.JmlBaris, 0)   AS JmlBaris,
      ISNULL(d.JmlBatang, 0)  AS JmlBatang,
      h.IdLokasi,
      CAST(ISNULL(f.IsGoingToBeUsed, 0) AS BIT) AS IsGoingToBeUsed
    FROM dbo.ST_h h
    CROSS APPLY (
      SELECT MAX(kh.TglKeluar) AS TglKeluar
      FROM dbo.KD_d kdd
      INNER JOIN dbo.KD_h kh ON kh.NoProcKD = kdd.NoProcKD
      WHERE kdd.NoST = h.NoST AND kh.TglKeluar IS NOT NULL
    ) kd
    OUTER APPLY (
      SELECT COUNT(*) AS JmlBaris, SUM(ISNULL(sd.JmlhBatang, 0)) AS JmlBatang
      FROM dbo.ST_d sd WHERE sd.NoST = h.NoST
    ) d
    LEFT JOIN dbo.MstJenisKayu k ON k.IdJenisKayu = h.IdJenisKayu
    LEFT JOIN dbo.BongkarStickReminderFlag f ON f.NoST = h.NoST
    WHERE h.DateUsage IS NULL
      AND h.IsSticked = 0
      AND kd.TglKeluar IS NOT NULL
    ORDER BY SudahBerapaHari DESC, h.NoST ASC
  `);

  const items = rs.recordset.map((r) => ({
    noST: r.NoST,
    jenis: r.JenisKayu ?? null,
    dateCreate: r.DateCreate,
    tglKeluar: r.TglKeluar,
    sudahBerapaHari: r.SudahBerapaHari,
    jmlBaris: r.JmlBaris,
    jmlBatang: r.JmlBatang,
    idLokasi: r.IdLokasi,
    isGoingToBeUsed: !!r.IsGoingToBeUsed,
    status: statusOf(r.SudahBerapaHari, setting),
  }));

  const summary = { total: items.length, normal: 0, warning: 0, critical: 0 };
  for (const it of items) summary[it.status] += 1;

  return { items, summary, setting };
}

async function updateSetting(data, user) {
  const warningDays = Number(data.warningDays);
  const criticalDays = Number(data.criticalDays);
  if (!Number.isInteger(warningDays) || warningDays < 1 || warningDays > 3650)
    throw httpError(400, "Batas warning harus bilangan bulat 1-3650 hari.");
  if (!Number.isInteger(criticalDays) || criticalDays < 1 || criticalDays > 3650)
    throw httpError(400, "Batas critical harus bilangan bulat 1-3650 hari.");
  if (criticalDays <= warningDays) throw httpError(400, "Batas critical harus lebih besar dari batas warning.");

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const req = new sql.Request(transaction);
    req.input("w", sql.Int, warningDays);
    req.input("c", sql.Int, criticalDays);
    req.input("u", sql.VarChar(50), user || "admin");
    await req.query(`
      MERGE dbo.BongkarStickReminderSetting AS t
      USING (SELECT 1 AS Id) AS s ON t.Id = s.Id
      WHEN MATCHED THEN UPDATE SET WarningDays = @w, CriticalDays = @c, UpdatedBy = @u, UpdatedAt = GETDATE()
      WHEN NOT MATCHED THEN INSERT (Id, WarningDays, CriticalDays, UpdatedBy, UpdatedAt) VALUES (1, @w, @c, @u, GETDATE());
    `);
    await audit(transaction, user, `Ubah setting Bongkar Stick Reminder: warning ${warningDays} hari, critical ${criticalDays} hari (Web)`);
    await transaction.commit();
    return { warningDays, criticalDays };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

async function setFlag(noSTParam, data, user) {
  const noST = String(noSTParam ?? "").trim();
  if (!noST || noST.length > 50) throw httpError(400, "NoST tidak valid.");
  if (typeof data.isGoingToBeUsed !== "boolean") throw httpError(400, "isGoingToBeUsed harus boolean.");
  const flag = data.isGoingToBeUsed;

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const chk = new sql.Request(transaction);
    chk.input("noST", sql.VarChar(50), noST);
    const ex = await chk.query(`SELECT TOP 1 1 AS ok FROM dbo.ST_h WHERE NoST = @noST`);
    if (!ex.recordset.length) throw httpError(404, `ST ${noST} tidak ditemukan.`);

    const req = new sql.Request(transaction);
    req.input("noST", sql.VarChar(50), noST);
    req.input("flag", sql.Bit, flag);
    req.input("u", sql.VarChar(50), user || "admin");
    await req.query(`
      MERGE dbo.BongkarStickReminderFlag AS t
      USING (SELECT @noST AS NoST) AS s ON t.NoST = s.NoST
      WHEN MATCHED THEN UPDATE SET IsGoingToBeUsed = @flag, UpdatedBy = @u, UpdatedAt = GETDATE()
      WHEN NOT MATCHED THEN INSERT (NoST, IsGoingToBeUsed, UpdatedBy, UpdatedAt) VALUES (@noST, @flag, @u, GETDATE());
    `);
    await audit(transaction, user, `Bongkar Stick Reminder: ${noST} IsGoingToBeUsed = ${flag ? "Ya" : "Tidak"} (Web)`);
    await transaction.commit();
    return { noST, isGoingToBeUsed: flag };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

module.exports = { getList, getSetting, updateSetting, setFlag };
