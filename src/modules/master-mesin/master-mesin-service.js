const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstMesin.vb
 * Master MstMesin (IdMesin, NamaMesin, Bagian, DefaultOprator, Remaks, [Enable], Target, IdBagian).
 * IdMesin = MAX + 1 (bukan identity / bukan jumlah baris seperti di VB).
 * Modul proses (S4S, FJ, Moulding, Laminating, CCA, Sanding, Packing) memilih mesin lewat IdBagian,
 * jadi mengganti bagian memindahkan mesin ke modul proses lain. Setiap perubahan dicatat ke Riwayat.
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
  const nama = String(data.namaMesin ?? "").trim();
  if (!nama) throw httpError(400, "Nama mesin harus diisi.");

  const idBagian = Number(data.idBagian);
  if (!Number.isInteger(idBagian) || idBagian <= 0) throw httpError(400, "Bagian harus dipilih.");
  const idOperator = Number(data.idOperator);
  if (!Number.isInteger(idOperator) || idOperator <= 0) throw httpError(400, "Operator default harus dipilih.");

  let target = null;
  if (data.target !== null && data.target !== undefined && String(data.target).trim() !== "") {
    target = Number(String(data.target).replace(",", "."));
    if (!Number.isFinite(target) || target < 0) throw httpError(400, "Target harus berupa angka 0 atau lebih.");
  }

  return {
    nama: nama.slice(0, 100),
    idBagian,
    idOperator,
    remaks: String(data.remaks ?? "").trim().slice(0, 255),
    target,
    enable: bit(data.enable),
  };
}

function bindFields(req, v, namaBagian) {
  req.input("nama", sql.VarChar(100), v.nama);
  req.input("bagian", sql.VarChar(100), namaBagian);
  req.input("idBagian", sql.Int, v.idBagian);
  req.input("idOperator", sql.Int, v.idOperator);
  req.input("remaks", sql.VarChar(255), v.remaks);
  req.input("enable", sql.Bit, v.enable);
  req.input("target", sql.Float, v.target);
}

/** Pastikan bagian & operator ada; kembalikan nama bagian (kolom teks Bagian ikut diisi). */
async function resolveRefs(transaction, v) {
  const r = new sql.Request(transaction);
  r.input("b", sql.Int, v.idBagian);
  r.input("o", sql.Int, v.idOperator);
  const rs = await r.query(`
    SELECT (SELECT NamaBagian FROM dbo.MstBagian WHERE IdBagian = @b) AS NamaBagian,
           (SELECT 1 FROM dbo.MstOperator WHERE IdOperator = @o) AS OperatorOk
  `);
  const row = rs.recordset[0];
  if (!row.NamaBagian) throw httpError(400, "Bagian tidak ditemukan.");
  if (!row.OperatorOk) throw httpError(400, "Operator tidak ditemukan.");
  return row.NamaBagian;
}

/** Nama mesin tidak boleh kembar dalam bagian yang sama (abaikan huruf besar/kecil). */
async function assertUnique(transaction, nama, idBagian, exceptId) {
  const r = new sql.Request(transaction);
  r.input("nama", sql.VarChar(100), nama);
  r.input("b", sql.Int, idBagian);
  r.input("id", sql.Int, exceptId ?? 0);
  const d = await r.query(
    `SELECT TOP 1 1 AS dup FROM dbo.MstMesin WHERE LTRIM(RTRIM(NamaMesin)) = @nama AND IdBagian = @b AND IdMesin <> @id`,
  );
  if (d.recordset.length) throw httpError(409, `Mesin "${nama}" sudah ada pada bagian yang sama.`);
}

function mapSqlError(err) {
  const n = err.number ?? err.originalError?.info?.number;
  if (n === 2628 || n === 8152) {
    return httpError(400, "Data terlalu panjang untuk disimpan. Persingkat nama mesin atau remark.");
  }
  return err;
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT A.IdMesin, A.NamaMesin, A.IdBagian, C.NamaBagian,
           A.DefaultOprator AS IdOperator, B.NamaOperator,
           CAST(ISNULL(A.[Enable], 0) AS bit) AS [Enable], A.Target, A.Remaks
    FROM dbo.MstMesin A
    LEFT JOIN dbo.MstOperator B ON B.IdOperator = A.DefaultOprator
    LEFT JOIN dbo.MstBagian C ON C.IdBagian = A.IdBagian
    ORDER BY A.IdMesin ASC
  `);
  return rs.recordset;
}

/** Pilihan dropdown: hanya bagian / operator yang aktif (seperti VB). */
async function getOptions() {
  const pool = await poolPromise;
  const [bagian, operators] = await Promise.all([
    pool.request().query(`
      SELECT IdBagian, NamaBagian FROM dbo.MstBagian WHERE [Enable] = 1 ORDER BY NamaBagian ASC
    `),
    pool.request().query(`
      SELECT IdOperator, NamaOperator FROM dbo.MstOperator WHERE [Enable] = 1 ORDER BY NamaOperator ASC
    `),
  ]);
  return { bagian: bagian.recordset, operators: operators.recordset };
}

async function create(data, user) {
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const namaBagian = await resolveRefs(transaction, v);
    await assertUnique(transaction, v.nama, v.idBagian, null);

    const m = await new sql.Request(transaction).query(
      `SELECT ISNULL(MAX(IdMesin), 0) + 1 AS NextId FROM dbo.MstMesin WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, id);
    bindFields(req, v, namaBagian);
    await req.query(`
      INSERT INTO dbo.MstMesin (IdMesin, NamaMesin, Bagian, DefaultOprator, Remaks, [Enable], Target, IdBagian)
      VALUES (@id, @nama, @bagian, @idOperator, @remaks, @enable, @target, @idBagian)
    `);
    await audit(transaction, user, `Menyimpan Data Master Mesin ${v.nama} (Web)`);
    await transaction.commit();
    return { idMesin: id };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw mapSqlError(err);
  }
}

async function update(id, data, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id mesin tidak valid.");
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`SELECT NamaMesin, IdBagian FROM dbo.MstMesin WHERE IdMesin = @id`);
    if (!cur.recordset.length) throw httpError(404, "Mesin tidak ditemukan.");

    const namaBagian = await resolveRefs(transaction, v);
    // Cek kembar hanya bila nama / bagian diganti, agar data lama yang sudah kembar tetap bisa diubah.
    const before = cur.recordset[0];
    if (
      String(before.NamaMesin ?? "").trim().toLowerCase() !== v.nama.toLowerCase() ||
      before.IdBagian !== v.idBagian
    ) {
      await assertUnique(transaction, v.nama, v.idBagian, idNum);
    }

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    bindFields(req, v, namaBagian);
    await req.query(`
      UPDATE dbo.MstMesin
      SET NamaMesin = @nama, Bagian = @bagian, IdBagian = @idBagian, DefaultOprator = @idOperator,
          Remaks = @remaks, [Enable] = @enable, Target = @target
      WHERE IdMesin = @id
    `);
    await audit(transaction, user, `Mengubah Data Master Mesin ${v.nama} (Web)`);
    await transaction.commit();
    return { idMesin: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw mapSqlError(err);
  }
}

async function remove(id, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id mesin tidak valid.");
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`SELECT NamaMesin FROM dbo.MstMesin WHERE IdMesin = @id`);
    if (!cur.recordset.length) throw httpError(404, "Mesin tidak ditemukan.");

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    await req.query(`DELETE FROM dbo.MstMesin WHERE IdMesin = @id`);
    await audit(transaction, user, `Menghapus Data Master Mesin ${cur.recordset[0].NamaMesin} (Web)`);
    await transaction.commit();
    return { idMesin: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    // 547 = pelanggaran FK: sudah dipakai transaksi produksi
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(
        409,
        "Mesin sudah dipakai pada transaksi produksi dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK ADA sebagai gantinya.",
      );
    }
    throw err;
  }
}

module.exports = { getAll, getOptions, create, update, remove };
