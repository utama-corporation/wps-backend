const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstOperator.vb
 * Master MstOperator (IdOperator, NamaOperator, [Enable], IdBagian) + lookup MstBagian.
 * IdOperator = MAX + 1 (bukan identity / bukan jumlah baris seperti di VB).
 * Operator dipakai sebagai operator default mesin (MstMesin.DefaultOprator) dan meja sawmill
 * (MstMesinSawmill.IdOperator1/2), jadi daftar menghitung pemakaian itu dan hapus ditolak bila masih dipakai.
 * Bagian operator menentukan di modul mana operator tampil (mis. bagian 8 & 9 = operator sawmill).
 * Setiap perubahan dicatat ke Riwayat.
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
  const nama = String(data.namaOperator ?? "").trim();
  if (!nama) throw httpError(400, "Nama operator harus diisi.");
  const idBagian = Number(data.idBagian);
  if (!Number.isInteger(idBagian) || idBagian <= 0) throw httpError(400, "Bagian harus dipilih.");
  return { nama: nama.slice(0, 100), idBagian, enable: bit(data.enable) };
}

function bindFields(req, v) {
  req.input("nama", sql.VarChar(100), v.nama);
  req.input("idBagian", sql.Int, v.idBagian);
  req.input("enable", sql.Bit, v.enable);
}

async function assertBagianExists(transaction, idBagian) {
  const r = new sql.Request(transaction);
  r.input("b", sql.Int, idBagian);
  const d = await r.query(`SELECT 1 AS ok FROM dbo.MstBagian WHERE IdBagian = @b`);
  if (!d.recordset.length) throw httpError(400, "Bagian tidak ditemukan.");
}

/** Nama operator tidak boleh kembar dalam bagian yang sama (abaikan huruf besar/kecil). */
async function assertUnique(transaction, nama, idBagian, exceptId) {
  const r = new sql.Request(transaction);
  r.input("nama", sql.VarChar(100), nama);
  r.input("b", sql.Int, idBagian);
  r.input("id", sql.Int, exceptId ?? 0);
  const d = await r.query(
    `SELECT TOP 1 1 AS dup FROM dbo.MstOperator WHERE LTRIM(RTRIM(NamaOperator)) = @nama AND IdBagian = @b AND IdOperator <> @id`,
  );
  if (d.recordset.length) throw httpError(409, `Operator "${nama}" sudah ada pada bagian yang sama.`);
}

function mapSqlError(err) {
  const n = err.number ?? err.originalError?.info?.number;
  if (n === 2628 || n === 8152) return httpError(400, "Data terlalu panjang untuk disimpan. Persingkat nama operator.");
  return err;
}

/** Jumlah mesin / meja sawmill yang memakai operator ini sebagai default. */
const USAGE_SQL = `
  (SELECT COUNT(*) FROM dbo.MstMesin m WHERE m.DefaultOprator = o.IdOperator)
  + (SELECT COUNT(*) FROM dbo.MstMesinSawmill s WHERE s.IdOperator1 = o.IdOperator OR s.IdOperator2 = o.IdOperator)
`;

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT o.IdOperator, o.NamaOperator, o.IdBagian, b.NamaBagian,
           CAST(ISNULL(o.[Enable], 0) AS bit) AS [Enable],
           ${USAGE_SQL} AS JumlahPakai
    FROM dbo.MstOperator o
    LEFT JOIN dbo.MstBagian b ON b.IdBagian = o.IdBagian
    ORDER BY o.IdOperator ASC
  `);
  return rs.recordset;
}

/** Pilihan dropdown bagian: hanya yang aktif (seperti VB). */
async function getOptions() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT IdBagian, NamaBagian FROM dbo.MstBagian WHERE [Enable] = 1 ORDER BY NamaBagian ASC
  `);
  return { bagian: rs.recordset };
}

async function create(data, user) {
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await assertBagianExists(transaction, v.idBagian);
    await assertUnique(transaction, v.nama, v.idBagian, null);

    const m = await new sql.Request(transaction).query(
      `SELECT ISNULL(MAX(IdOperator), 0) + 1 AS NextId FROM dbo.MstOperator WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, id);
    bindFields(req, v);
    await req.query(`
      INSERT INTO dbo.MstOperator (IdOperator, NamaOperator, [Enable], IdBagian)
      VALUES (@id, @nama, @enable, @idBagian)
    `);
    await audit(transaction, user, `Menyimpan Data Master Operator ${v.nama} (Web)`);
    await transaction.commit();
    return { idOperator: id };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw mapSqlError(err);
  }
}

async function update(id, data, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id operator tidak valid.");
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`SELECT NamaOperator, IdBagian FROM dbo.MstOperator WHERE IdOperator = @id`);
    if (!cur.recordset.length) throw httpError(404, "Operator tidak ditemukan.");

    await assertBagianExists(transaction, v.idBagian);
    // Cek kembar hanya bila nama / bagian diganti, agar data lama yang sudah kembar tetap bisa diubah.
    const before = cur.recordset[0];
    if (
      String(before.NamaOperator ?? "").trim().toLowerCase() !== v.nama.toLowerCase() ||
      before.IdBagian !== v.idBagian
    ) {
      await assertUnique(transaction, v.nama, v.idBagian, idNum);
    }

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    bindFields(req, v);
    await req.query(`
      UPDATE dbo.MstOperator SET NamaOperator = @nama, IdBagian = @idBagian, [Enable] = @enable
      WHERE IdOperator = @id
    `);
    await audit(transaction, user, `Mengubah Data Master Operator ${v.nama} (Web)`);
    await transaction.commit();
    return { idOperator: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw mapSqlError(err);
  }
}

async function remove(id, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id operator tidak valid.");
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`
      SELECT o.NamaOperator, ${USAGE_SQL} AS JumlahPakai
      FROM dbo.MstOperator o WHERE o.IdOperator = @id
    `);
    if (!cur.recordset.length) throw httpError(404, "Operator tidak ditemukan.");
    if (cur.recordset[0].JumlahPakai > 0) {
      throw httpError(
        409,
        `Operator "${cur.recordset[0].NamaOperator}" masih dipakai ${cur.recordset[0].JumlahPakai} mesin / meja sawmill sebagai operator default dan tidak dapat dihapus. Ganti operator default-nya atau ubah status operator menjadi TIDAK AKTIF.`,
      );
    }

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    await req.query(`DELETE FROM dbo.MstOperator WHERE IdOperator = @id`);
    await audit(transaction, user, `Menghapus Data Master Operator ${cur.recordset[0].NamaOperator} (Web)`);
    await transaction.commit();
    return { idOperator: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    // 547 = pelanggaran FK: sudah dipakai transaksi produksi / tally
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(
        409,
        "Operator sudah dipakai pada transaksi dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK AKTIF sebagai gantinya.",
      );
    }
    throw err;
  }
}

module.exports = { getAll, getOptions, create, update, remove };
