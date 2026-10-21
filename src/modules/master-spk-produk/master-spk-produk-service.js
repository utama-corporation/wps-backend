const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmSPKProduk.vb ("Master Produk SPK (Multi Ukuran)")
 * MstProdukSPK (IdProdukSPK = MAX + 1, bukan identity) + MstProdukSPK_d (Tebal, Lebar, IdUOMTblLebar).
 * Simpan/ubah menulis header + seluruh ukuran dalam satu transaksi (ubah = hapus lalu isi ulang).
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
const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

function validate(data) {
  const nama = str(data.nama);
  if (!nama) throw httpError(400, "Nama produk harus diisi.");
  if (nama.length > 150) throw httpError(400, "Nama produk maksimal 150 karakter.");

  let idTarget = null;
  if (data.idTargetGroupingKayu !== null && data.idTargetGroupingKayu !== undefined && data.idTargetGroupingKayu !== "") {
    idTarget = Number(data.idTargetGroupingKayu);
    if (!Number.isInteger(idTarget) || idTarget <= 0) throw httpError(400, "Target grouping kayu tidak valid.");
  }

  const ukuran = (Array.isArray(data.ukuran) ? data.ukuran : []).map((r, i) => {
    const tebal = num(r.tebal);
    const lebar = num(r.lebar);
    if (!(tebal > 0)) throw httpError(400, `Tebal harus lebih dari 0 (ukuran baris ${i + 1}).`);
    if (!(lebar > 0)) throw httpError(400, `Lebar harus lebih dari 0 (ukuran baris ${i + 1}).`);
    let idUOM = null;
    if (r.idUOMTblLebar !== null && r.idUOMTblLebar !== undefined && r.idUOMTblLebar !== "") {
      idUOM = Number(r.idUOMTblLebar);
      if (!Number.isInteger(idUOM) || idUOM <= 0) throw httpError(400, `UOM tidak valid (ukuran baris ${i + 1}).`);
    }
    return { tebal, lebar, idUOM };
  });
  if (!ukuran.length) throw httpError(400, "Minimal harus ada 1 ukuran produk.");
  // PK tabel detail: IdProdukSPK + Tebal + Lebar
  const seen = new Set();
  for (const u of ukuran) {
    const k = `${u.tebal}|${u.lebar}`;
    if (seen.has(k)) throw httpError(400, `Ukuran ${u.tebal} x ${u.lebar} duplikat.`);
    seen.add(k);
  }
  return { nama, idTarget, ukuran };
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

/* ===================== READ ===================== */

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT p.IdProdukSPK, p.NamaProduk, p.IdTargetGroupingKayu, tg.NamaGroup AS TargetGrouping,
           (SELECT COUNT(*) FROM MstProdukSPK_d d WHERE d.IdProdukSPK = p.IdProdukSPK) AS JumlahUkuran,
           (SELECT COUNT(*) FROM MstSPK_dProdukSPK s WHERE s.IdProdukSPK = p.IdProdukSPK) AS DipakaiSPK
    FROM MstProdukSPK p
    LEFT JOIN MstTargetGroupingKayu_h tg ON tg.IdTargetGroupingKayu = p.IdTargetGroupingKayu
    ORDER BY p.IdProdukSPK DESC
  `);
  return rs.recordset;
}

async function getMasters() {
  const pool = await poolPromise;
  const [grouping, uom] = await Promise.all([
    pool.request().query(`
      SELECT IdTargetGroupingKayu AS id, NamaGroup AS nama
      FROM MstTargetGroupingKayu_h
      WHERE ISNULL([Enable], 1) = 1
      ORDER BY NamaGroup
    `),
    pool.request().query(`SELECT IdUOM AS id, UOM AS nama FROM MstUOM WHERE [Enable] = 1 ORDER BY UOM`),
  ]);
  return { target_grouping: grouping.recordset, uom: uom.recordset };
}

async function getById(idParam) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id produk tidak valid.");
  const pool = await poolPromise;
  const head = await pool
    .request()
    .input("id", sql.Int, id)
    .query(`
      SELECT p.IdProdukSPK, p.NamaProduk, p.IdTargetGroupingKayu, tg.NamaGroup AS TargetGrouping,
             (SELECT COUNT(*) FROM MstSPK_dProdukSPK s WHERE s.IdProdukSPK = p.IdProdukSPK) AS DipakaiSPK
      FROM MstProdukSPK p
      LEFT JOIN MstTargetGroupingKayu_h tg ON tg.IdTargetGroupingKayu = p.IdTargetGroupingKayu
      WHERE p.IdProdukSPK = @id
    `);
  if (!head.recordset[0]) return null;
  const det = await pool
    .request()
    .input("id", sql.Int, id)
    .query(`
      SELECT d.Tebal, d.Lebar, d.IdUOMTblLebar, u.UOM
      FROM MstProdukSPK_d d
      LEFT JOIN MstUOM u ON u.IdUOM = d.IdUOMTblLebar
      WHERE d.IdProdukSPK = @id
      ORDER BY d.Tebal, d.Lebar
    `);
  return { header: head.recordset[0], ukuran: det.recordset };
}

/* ===================== WRITE ===================== */

async function assertRefs(tx, v) {
  if (v.idTarget !== null) {
    const r = await new sql.Request(tx)
      .input("id", sql.Int, v.idTarget)
      .query(`SELECT 1 AS ok FROM MstTargetGroupingKayu_h WHERE IdTargetGroupingKayu = @id`);
    if (!r.recordset.length) throw httpError(400, "Target grouping kayu tidak ditemukan.");
  }
  const uoms = [...new Set(v.ukuran.map((u) => u.idUOM).filter((x) => x !== null))];
  if (uoms.length) {
    const r = await new sql.Request(tx).query(`SELECT COUNT(*) AS n FROM MstUOM WHERE IdUOM IN (${uoms.join(",")})`);
    if (Number(r.recordset[0].n) !== uoms.length) throw httpError(400, "UOM tidak ditemukan di master.");
  }
}

async function assertNamaUnik(tx, nama, exceptId) {
  const r = await new sql.Request(tx)
    .input("n", sql.VarChar(150), nama)
    .input("id", sql.Int, exceptId ?? 0)
    .query(`SELECT TOP 1 1 AS dup FROM MstProdukSPK WHERE NamaProduk = @n AND IdProdukSPK <> @id`);
  if (r.recordset.length) throw httpError(409, `Produk "${nama}" sudah ada.`);
}

async function insertUkuran(tx, id, ukuran) {
  for (const u of ukuran) {
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("t", sql.Float, u.tebal)
      .input("l", sql.Float, u.lebar)
      .input("uom", sql.Int, u.idUOM)
      .query(`INSERT INTO MstProdukSPK_d (IdProdukSPK, Tebal, Lebar, IdUOMTblLebar) VALUES (@id, @t, @l, @uom)`);
  }
}

async function create(data, user) {
  const v = validate(data);
  return withTx(async (tx) => {
    await assertRefs(tx, v);
    await assertNamaUnik(tx, v.nama, null);
    const m = await new sql.Request(tx).query(
      `SELECT ISNULL(MAX(IdProdukSPK), 0) + 1 AS NextId FROM MstProdukSPK WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("nama", sql.VarChar(150), v.nama)
      .input("tg", sql.Int, v.idTarget)
      .query(`INSERT INTO MstProdukSPK (IdProdukSPK, NamaProduk, IdTargetGroupingKayu) VALUES (@id, @nama, @tg)`);
    await insertUkuran(tx, id, v.ukuran);
    await audit(tx, user, `Menyimpan Data Master Produk SPK ${v.nama} (Web)`);
    return { idProdukSPK: id };
  });
}

async function update(idParam, data, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id produk tidak valid.");
  const v = validate(data);
  return withTx(async (tx) => {
    const cur = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .query(`SELECT 1 AS ok FROM MstProdukSPK WITH (UPDLOCK, HOLDLOCK) WHERE IdProdukSPK = @id`);
    if (!cur.recordset.length) throw httpError(404, "Produk SPK tidak ditemukan.");
    await assertRefs(tx, v);
    await assertNamaUnik(tx, v.nama, id);
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("nama", sql.VarChar(150), v.nama)
      .input("tg", sql.Int, v.idTarget)
      .query(`UPDATE MstProdukSPK SET NamaProduk = @nama, IdTargetGroupingKayu = @tg WHERE IdProdukSPK = @id`);
    await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM MstProdukSPK_d WHERE IdProdukSPK = @id`);
    await insertUkuran(tx, id, v.ukuran);
    await audit(tx, user, `Mengubah Data Master Produk SPK ${v.nama} (Web)`);
    return { idProdukSPK: id };
  });
}

async function remove(idParam, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id produk tidak valid.");
  return withTx(async (tx) => {
    const cur = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .query(`SELECT NamaProduk FROM MstProdukSPK WHERE IdProdukSPK = @id`);
    if (!cur.recordset.length) throw httpError(404, "Produk SPK tidak ditemukan.");
    const used = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .query(`SELECT COUNT(*) AS n FROM MstSPK_dProdukSPK WHERE IdProdukSPK = @id`);
    if (Number(used.recordset[0].n) > 0) {
      throw httpError(409, "Data tidak dapat dihapus karena sudah digunakan di SPK!");
    }
    await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM MstProdukSPK_d WHERE IdProdukSPK = @id`);
    await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM MstProdukSPK WHERE IdProdukSPK = @id`);
    await audit(tx, user, `Menghapus Data Master Produk SPK ${cur.recordset[0].NamaProduk} (Web)`);
    return { idProdukSPK: id };
  });
}

module.exports = { getAll, getMasters, getById, create, update, remove };
