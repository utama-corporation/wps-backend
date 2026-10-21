const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstSupplier.vb
 * Master MstSupplier (IdSupplier, NmSupplier, NoTlp, Enable, Alamat).
 * IdSupplier = MAX + 1 (bukan identity). Setiap perubahan dicatat ke Riwayat.
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
  const nama = String(data.nama ?? "").trim();
  const noTlp = String(data.noTlp ?? "").trim();
  const alamat = String(data.alamat ?? "").trim();
  if (!nama) throw httpError(400, "Nama supplier harus diisi.");
  if (!noTlp) throw httpError(400, "No. telepon / handphone harus diisi.");
  return { nama: nama.slice(0, 100), noTlp: noTlp.slice(0, 50), alamat: alamat.slice(0, 255), enable: bit(data.enable) };
}

function bindFields(req, v) {
  req.input("nama", sql.VarChar(100), v.nama);
  req.input("noTlp", sql.VarChar(50), v.noTlp);
  req.input("alamat", sql.VarChar(255), v.alamat);
  req.input("enable", sql.Bit, v.enable);
}

/** Nama supplier tidak boleh kembar (abaikan huruf besar/kecil). */
async function assertUnique(transaction, nama, exceptId) {
  const r = new sql.Request(transaction);
  r.input("nama", sql.VarChar(100), nama);
  r.input("id", sql.Int, exceptId ?? 0);
  const d = await r.query(
    `SELECT TOP 1 1 AS dup FROM dbo.MstSupplier WHERE LTRIM(RTRIM(NmSupplier)) = @nama AND IdSupplier <> @id`,
  );
  if (d.recordset.length) throw httpError(409, `Supplier "${nama}" sudah ada.`);
}

/** Kolom varchar lebih pendek dari input -> pesan yang bisa dipahami. */
function mapSqlError(err) {
  const n = err.number ?? err.originalError?.info?.number;
  if (n === 2628 || n === 8152) {
    return httpError(400, "Data terlalu panjang untuk disimpan. Persingkat nama, telepon, atau alamat.");
  }
  return err;
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT IdSupplier, NmSupplier, NoTlp, [Enable], Alamat
    FROM dbo.MstSupplier
    ORDER BY IdSupplier ASC
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
      `SELECT ISNULL(MAX(IdSupplier), 0) + 1 AS NextId FROM dbo.MstSupplier WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, id);
    bindFields(req, v);
    await req.query(`
      INSERT INTO dbo.MstSupplier (IdSupplier, NmSupplier, NoTlp, [Enable], Alamat)
      VALUES (@id, @nama, @noTlp, @enable, @alamat)
    `);
    await audit(transaction, user, `Menyimpan Data Supplier ${v.nama} Pada Data Master Supplier (Web)`);
    await transaction.commit();
    return { idSupplier: id };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw mapSqlError(err);
  }
}

async function update(id, data, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id supplier tidak valid.");
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`SELECT NmSupplier FROM dbo.MstSupplier WHERE IdSupplier = @id`);
    if (!cur.recordset.length) throw httpError(404, "Supplier tidak ditemukan.");
    // Cek kembar hanya bila nama diganti, agar data lama yang sudah kembar tetap bisa diubah.
    if (String(cur.recordset[0].NmSupplier ?? "").trim().toLowerCase() !== v.nama.toLowerCase()) {
      await assertUnique(transaction, v.nama, idNum);
    }

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    bindFields(req, v);
    await req.query(`
      UPDATE dbo.MstSupplier
      SET NmSupplier = @nama, NoTlp = @noTlp, [Enable] = @enable, Alamat = @alamat
      WHERE IdSupplier = @id
    `);
    await audit(transaction, user, `Mengubah Data Supplier ${v.nama} Pada Data Master Supplier (Web)`);
    await transaction.commit();
    return { idSupplier: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw mapSqlError(err);
  }
}

async function remove(id, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id supplier tidak valid.");
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`SELECT NmSupplier FROM dbo.MstSupplier WHERE IdSupplier = @id`);
    if (!cur.recordset.length) throw httpError(404, "Supplier tidak ditemukan.");

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    await req.query(`DELETE FROM dbo.MstSupplier WHERE IdSupplier = @id`);
    await audit(transaction, user, `Menghapus Data Supplier ${cur.recordset[0].NmSupplier} Pada Data Master Supplier (Web)`);
    await transaction.commit();
    return { idSupplier: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    // 547 = pelanggaran FK: sudah dipakai transaksi
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(
        409,
        "Supplier sudah dipakai pada transaksi dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK AKTIF sebagai gantinya.",
      );
    }
    throw err;
  }
}

module.exports = { getAll, create, update, remove };
