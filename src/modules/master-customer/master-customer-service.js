const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstCustomerUpah.vb ("Data Master Customer Upah")
 * MstCustomerUpah (IdCustomer varchar(13) berisi angka = MAX + 1; NamaCustomer varchar(30);
 * NamaPrusahaan varchar(50) [sic]; NoTelepon varchar(13)).
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

const str = (v) => String(v ?? "").trim();

function validate(data) {
  const nama = str(data.nama);
  const perusahaan = str(data.perusahaan);
  const telepon = str(data.telepon);
  if (!nama) throw httpError(400, "Nama customer harus diisi.");
  if (!perusahaan) throw httpError(400, "Nama perusahaan harus diisi.");
  if (!telepon) throw httpError(400, "No. telepon / HP harus diisi.");
  if (nama.length > 30) throw httpError(400, "Nama customer maksimal 30 karakter.");
  if (perusahaan.length > 50) throw httpError(400, "Nama perusahaan maksimal 50 karakter.");
  if (telepon.length > 13) throw httpError(400, "No. telepon / HP maksimal 13 karakter.");
  return { nama, perusahaan, telepon };
}

async function withTx(fn) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const out = await fn(transaction);
    await transaction.commit();
    return out;
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

async function assertUnique(tx, nama, exceptId) {
  const r = await new sql.Request(tx)
    .input("n", sql.VarChar(30), nama)
    .input("id", sql.VarChar(13), exceptId ?? "")
    .query(`SELECT TOP 1 1 AS dup FROM MstCustomerUpah WHERE NamaCustomer = @n AND IdCustomer <> @id`);
  if (r.recordset.length) throw httpError(409, `Customer "${nama}" sudah ada.`);
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT c.IdCustomer, c.NamaCustomer, c.NamaPrusahaan AS NamaPerusahaan, c.NoTelepon,
           (SELECT COUNT(*) FROM STPengembalianUpah_h p WHERE p.IdCustomer = c.IdCustomer) AS JumlahTransaksi
    FROM MstCustomerUpah c
    ORDER BY TRY_CAST(c.IdCustomer AS int) DESC, c.IdCustomer DESC
  `);
  return rs.recordset;
}

async function create(data, user) {
  const v = validate(data);
  return withTx(async (tx) => {
    await assertUnique(tx, v.nama, null);
    const m = await new sql.Request(tx).query(
      `SELECT ISNULL(MAX(TRY_CAST(IdCustomer AS int)), 0) + 1 AS NextId FROM MstCustomerUpah WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = String(m.recordset[0].NextId);
    await new sql.Request(tx)
      .input("id", sql.VarChar(13), id)
      .input("n", sql.VarChar(30), v.nama)
      .input("p", sql.VarChar(50), v.perusahaan)
      .input("t", sql.VarChar(13), v.telepon)
      .query(
        `INSERT INTO MstCustomerUpah (IdCustomer, NamaCustomer, NamaPrusahaan, NoTelepon) VALUES (@id, @n, @p, @t)`,
      );
    await audit(tx, user, `Menyimpan Data Customer By ${v.nama} Pada Data Master Customer (Web)`);
    return { idCustomer: id };
  });
}

async function update(idParam, data, user) {
  const id = str(idParam);
  if (!id) throw httpError(400, "Id customer tidak valid.");
  const v = validate(data);
  return withTx(async (tx) => {
    await assertUnique(tx, v.nama, id);
    const r = await new sql.Request(tx)
      .input("id", sql.VarChar(13), id)
      .input("n", sql.VarChar(30), v.nama)
      .input("p", sql.VarChar(50), v.perusahaan)
      .input("t", sql.VarChar(13), v.telepon)
      .query(
        `UPDATE MstCustomerUpah SET NamaCustomer = @n, NamaPrusahaan = @p, NoTelepon = @t WHERE IdCustomer = @id`,
      );
    if (!r.rowsAffected[0]) throw httpError(404, "Customer tidak ditemukan.");
    await audit(tx, user, `Mengubah Data Customer By ${v.nama} Pada Data Master Customer (Web)`);
    return { idCustomer: id };
  });
}

async function remove(idParam, user) {
  const id = str(idParam);
  if (!id) throw httpError(400, "Id customer tidak valid.");
  try {
    return await withTx(async (tx) => {
      const cur = await new sql.Request(tx)
        .input("id", sql.VarChar(13), id)
        .query(`SELECT NamaCustomer FROM MstCustomerUpah WHERE IdCustomer = @id`);
      if (!cur.recordset.length) throw httpError(404, "Customer tidak ditemukan.");
      await new sql.Request(tx).input("id", sql.VarChar(13), id).query(`DELETE FROM MstCustomerUpah WHERE IdCustomer = @id`);
      await audit(tx, user, `Menghapus Data Customer By ${cur.recordset[0].NamaCustomer} Pada Data Master Customer (Web)`);
      return { idCustomer: id };
    });
  } catch (err) {
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(409, "Customer sudah dipakai pada transaksi (pengembalian ST upah) dan tidak dapat dihapus.");
    }
    throw err;
  }
}

module.exports = { getAll, create, update, remove };
