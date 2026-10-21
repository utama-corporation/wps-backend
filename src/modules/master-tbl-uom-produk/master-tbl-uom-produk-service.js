const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstTblUOMProduk.vb ("Data Master Tebal UOM Produk")
 * MstTblUOMProduk PK komposit: (IdGroup, Tebal, Lebar, IdUOM); Produk varchar(25); kolom No nullable (diabaikan).
 * Update desktop: SET Produk WHERE key lama. Hapus: WHERE key + Produk.
 * API: old key + nilai baru; RowNum (ROW_NUMBER) sebagai identitas baris read-only.
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
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

function validateValues(data) {
  const idGroup = num(data?.idGroup);
  const tebal = num(data?.tebal);
  const lebar = num(data?.lebar);
  const idUom = num(data?.idUom);
  const produk = str(data?.produk);
  if (!Number.isInteger(idGroup)) throw httpError(400, "Group kayu harus dipilih.");
  if (Number.isNaN(tebal)) throw httpError(400, "Tebal harus angka.");
  if (Number.isNaN(lebar)) throw httpError(400, "Lebar harus angka.");
  if (!Number.isInteger(idUom)) throw httpError(400, "UOM harus dipilih.");
  if (!produk) throw httpError(400, "Produk harus diisi.");
  if (produk.length > 25) throw httpError(400, "Produk maksimal 25 karakter.");
  return { idGroup, tebal, lebar, idUom, produk };
}

function validateKey(data) {
  const idGroup = num(data?.idGroup);
  const tebal = num(data?.tebal);
  const lebar = num(data?.lebar);
  const idUom = num(data?.idUom);
  if (!Number.isInteger(idGroup)) throw httpError(400, "Group kayu harus dipilih.");
  if (Number.isNaN(tebal)) throw httpError(400, "Tebal harus angka.");
  if (Number.isNaN(lebar)) throw httpError(400, "Lebar harus angka.");
  if (!Number.isInteger(idUom)) throw httpError(400, "UOM harus dipilih.");
  return { idGroup, tebal, lebar, idUom };
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

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT ROW_NUMBER() OVER (ORDER BY A.IdGroup ASC, A.Tebal ASC, A.Lebar ASC, A.IdUOM ASC) AS RowNum,
           A.IdGroup, B.[Group], A.Tebal, A.Lebar, A.IdUOM, C.UOM, A.Produk
    FROM MstTblUOMProduk A
    INNER JOIN MstGroupJenisKayu B ON B.IdGroup = A.IdGroup
    INNER JOIN MstUOM C ON C.IdUOM = A.IdUOM
    ORDER BY A.IdGroup ASC, A.Tebal ASC, A.Lebar ASC, A.IdUOM ASC
  `);
  return rs.recordset;
}

async function getLookups() {
  const pool = await poolPromise;
  const [g, uom] = await Promise.all([
    pool.request().query(`SELECT IdGroup, [Group] FROM MstGroupJenisKayu ORDER BY [Group] ASC`),
    pool.request().query(`SELECT IdUOM, UOM FROM MstUOM ORDER BY IdUOM ASC`),
  ]);
  return { groupKayu: g.recordset, uom: uom.recordset };
}

async function create(data, user) {
  const v = validateValues(data);
  return withTx(async (tx) => {
    const dup = await new sql.Request(tx)
      .input("g", sql.Int, v.idGroup)
      .input("t", sql.Float, v.tebal)
      .input("l", sql.Float, v.lebar)
      .input("u", sql.Int, v.idUom)
      .query(`SELECT TOP 1 1 AS dup FROM MstTblUOMProduk WHERE IdGroup = @g AND Tebal = @t AND Lebar = @l AND IdUOM = @u`);
    if (dup.recordset.length) throw httpError(409, "Baris Tebal UOM Produk untuk group, tebal, lebar dan UOM tersebut sudah ada.");
    await new sql.Request(tx)
      .input("g", sql.Int, v.idGroup)
      .input("t", sql.Float, v.tebal)
      .input("l", sql.Float, v.lebar)
      .input("u", sql.Int, v.idUom)
      .input("p", sql.VarChar(25), v.produk)
      .query(`INSERT INTO MstTblUOMProduk (IdGroup, Tebal, Lebar, IdUOM, Produk) VALUES (@g, @t, @l, @u, @p)`);
    await audit(tx, user, `Menyimpan Data Master Tebal UOM Produk ${v.produk} (Web)`);
    return { idGroup: v.idGroup, tebal: v.tebal, lebar: v.lebar, idUom: v.idUom };
  });
}

async function update(body, user) {
  const oldKey = validateKey(body?.old || {});
  const v = validateValues(body?.new || body || {});
  return withTx(async (tx) => {
    const r = await new sql.Request(tx)
      .input("og", sql.Int, oldKey.idGroup)
      .input("ot", sql.Float, oldKey.tebal)
      .input("ol", sql.Float, oldKey.lebar)
      .input("ou", sql.Int, oldKey.idUom)
      .input("g", sql.Int, v.idGroup)
      .input("t", sql.Float, v.tebal)
      .input("l", sql.Float, v.lebar)
      .input("u", sql.Int, v.idUom)
      .input("p", sql.VarChar(25), v.produk)
      .query(`UPDATE MstTblUOMProduk SET IdGroup = @g, Tebal = @t, Lebar = @l, IdUOM = @u, Produk = @p
              WHERE IdGroup = @og AND Tebal = @ot AND Lebar = @ol AND IdUOM = @ou`);
    if (!r.rowsAffected[0]) throw httpError(404, "Baris Tebal UOM Produk tidak ditemukan (key lama tidak cocok).");
    await audit(tx, user, `Mengubah Data Master Tebal UOM Produk ${v.produk} (Web)`);
    return { idGroup: v.idGroup, tebal: v.tebal, lebar: v.lebar, idUom: v.idUom };
  });
}

async function remove(body, user) {
  const k = validateKey(body || {});
  const produk = str(body?.produk);
  try {
    return await withTx(async (tx) => {
      const req = new sql.Request(tx)
        .input("g", sql.Int, k.idGroup)
        .input("t", sql.Float, k.tebal)
        .input("l", sql.Float, k.lebar)
        .input("u", sql.Int, k.idUom);
      const r = produk
        ? await req.input("p", sql.VarChar(25), produk)
            .query(`DELETE FROM MstTblUOMProduk WHERE IdGroup = @g AND Tebal = @t AND Lebar = @l AND IdUOM = @u AND Produk = @p`)
        : await req.query(`DELETE FROM MstTblUOMProduk WHERE IdGroup = @g AND Tebal = @t AND Lebar = @l AND IdUOM = @u`);
      if (!r.rowsAffected[0]) throw httpError(404, "Baris Tebal UOM Produk tidak ditemukan.");
      await audit(tx, user, `Menghapus Data Master Tebal UOM Produk ${produk || ""} (Web)`);
      return { idGroup: k.idGroup, tebal: k.tebal, lebar: k.lebar, idUom: k.idUom };
    });
  } catch (err) {
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(409, "Baris Tebal UOM Produk masih dipakai pada data lain dan tidak dapat dihapus.");
    }
    throw err;
  }
}

module.exports = { getAll, getLookups, create, update, remove };
