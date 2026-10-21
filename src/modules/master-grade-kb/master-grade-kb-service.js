const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstGradeKB.vb
 * Master MstGradeKB (IdGradeKB, NamaGrade, IsKayuBulat, IsST, [Enable], Harga).
 * Tipe grade: KAYU BULAT atau ST (saling lepas, seperti dua centang di VB).
 * IdGradeKB = MAX + 1 (bukan identity). NamaGrade dipakai sebagai kunci pencarian di modul lain
 * (penerimaan kayu bulat, tally sawmill), jadi harus unik. Setiap perubahan dicatat ke Riwayat.
 * ==========================================================*/

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

const bit = (v) => (v === true || v === 1 || v === "1" || v === "true" ? 1 : 0);

function validate(data) {
  const nama = String(data.namaGrade ?? "").trim();
  if (!nama) throw httpError(400, "Nama grade harus diisi.");

  const tipe = String(data.tipe ?? "").toUpperCase();
  if (tipe !== "KB" && tipe !== "ST") throw httpError(400, "Tipe grade harus dipilih (Kayu Bulat atau ST).");

  let harga = null;
  if (data.harga !== null && data.harga !== undefined && String(data.harga).trim() !== "") {
    harga = Number(String(data.harga).replace(",", "."));
    if (!Number.isFinite(harga) || harga < 0) throw httpError(400, "Harga harus berupa angka 0 atau lebih.");
  }

  return {
    nama: nama.slice(0, 100),
    isKayuBulat: tipe === "KB" ? 1 : 0,
    isST: tipe === "ST" ? 1 : 0,
    enable: bit(data.enable),
    harga,
  };
}

function bindFields(req, v) {
  req.input("nama", sql.VarChar(100), v.nama);
  req.input("isKB", sql.Bit, v.isKayuBulat);
  req.input("isST", sql.Bit, v.isST);
  req.input("enable", sql.Bit, v.enable);
  req.input("harga", sql.Float, v.harga);
}

async function assertUnique(transaction, nama, exceptId) {
  const r = new sql.Request(transaction);
  r.input("nama", sql.VarChar(100), nama);
  r.input("id", sql.Int, exceptId ?? 0);
  const d = await r.query(
    `SELECT TOP 1 1 AS dup FROM dbo.MstGradeKB WHERE LTRIM(RTRIM(NamaGrade)) = @nama AND IdGradeKB <> @id`,
  );
  if (d.recordset.length) throw httpError(409, `Grade "${nama}" sudah ada.`);
}

function mapSqlError(err) {
  const n = err.number ?? err.originalError?.info?.number;
  if (n === 2628 || n === 8152) return httpError(400, "Data terlalu panjang untuk disimpan. Persingkat nama grade.");
  return err;
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT IdGradeKB, NamaGrade,
           CAST(ISNULL(IsKayuBulat, 0) AS bit) AS IsKayuBulat,
           CAST(ISNULL(IsST, 0) AS bit) AS IsST,
           CAST(ISNULL([Enable], 0) AS bit) AS [Enable],
           Harga
    FROM dbo.MstGradeKB
    ORDER BY IdGradeKB ASC
  `);
  return rs.recordset;
}

async function create(data, user) {
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await assertUnique(transaction, v.nama, null);

    const m = await new sql.Request(transaction).query(
      `SELECT ISNULL(MAX(IdGradeKB), 0) + 1 AS NextId FROM dbo.MstGradeKB WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, id);
    bindFields(req, v);
    await req.query(`
      INSERT INTO dbo.MstGradeKB (IdGradeKB, NamaGrade, IsKayuBulat, IsST, [Enable], Harga)
      VALUES (@id, @nama, @isKB, @isST, @enable, @harga)
    `);
    await audit(transaction, user, `Menyimpan Data Master Grade KB ${v.nama} (Web)`);
    await transaction.commit();
    return { idGradeKB: id };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw mapSqlError(err);
  }
}

async function update(id, data, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id grade tidak valid.");
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`SELECT NamaGrade FROM dbo.MstGradeKB WHERE IdGradeKB = @id`);
    if (!cur.recordset.length) throw httpError(404, "Grade tidak ditemukan.");
    // Cek kembar hanya bila nama diganti, agar data lama yang sudah kembar tetap bisa diubah.
    if (String(cur.recordset[0].NamaGrade ?? "").trim().toLowerCase() !== v.nama.toLowerCase()) {
      await assertUnique(transaction, v.nama, idNum);
    }

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    bindFields(req, v);
    await req.query(`
      UPDATE dbo.MstGradeKB
      SET NamaGrade = @nama, IsKayuBulat = @isKB, IsST = @isST, [Enable] = @enable, Harga = @harga
      WHERE IdGradeKB = @id
    `);
    await audit(transaction, user, `Mengubah Data Master Grade KB ${v.nama} (Web)`);
    await transaction.commit();
    return { idGradeKB: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw mapSqlError(err);
  }
}

async function remove(id, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id grade tidak valid.");
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`SELECT NamaGrade FROM dbo.MstGradeKB WHERE IdGradeKB = @id`);
    if (!cur.recordset.length) throw httpError(404, "Grade tidak ditemukan.");

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    await req.query(`DELETE FROM dbo.MstGradeKB WHERE IdGradeKB = @id`);
    await audit(transaction, user, `Menghapus Data Master Grade KB ${cur.recordset[0].NamaGrade} (Web)`);
    await transaction.commit();
    return { idGradeKB: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    // 547 = pelanggaran FK: sudah dipakai transaksi
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(
        409,
        "Grade sudah dipakai pada transaksi dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK ADA sebagai gantinya.",
      );
    }
    throw err;
  }
}

module.exports = { getAll, create, update, remove };
