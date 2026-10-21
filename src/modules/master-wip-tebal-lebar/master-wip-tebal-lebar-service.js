const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstWIPTebalLebarGradeProduk.vb
 * ("Data Master WIP Tebal Lebar Grade Produk")
 * MstWIPTebalLebarGradeProduk PK komposit: (IdGroup, IdGrade, Tebal, Lebar); Produk varchar(25).
 * Catatan: insert/hapus desktop punya bug menulis IdGroup dua kali (ValueIDGroupKayu utk IdGrade);
 * versi web memakai IdGrade yang benar dari dropdown Grade.
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
  const idGrade = num(data?.idGrade);
  const tebal = num(data?.tebal);
  const lebar = num(data?.lebar);
  const produk = str(data?.produk);
  if (!Number.isInteger(idGroup)) throw httpError(400, "Group kayu harus dipilih.");
  if (!Number.isInteger(idGrade)) throw httpError(400, "Grade harus dipilih.");
  if (Number.isNaN(tebal)) throw httpError(400, "Tebal harus angka.");
  if (Number.isNaN(lebar)) throw httpError(400, "Lebar harus angka.");
  if (!produk) throw httpError(400, "Produk harus diisi.");
  if (produk.length > 25) throw httpError(400, "Produk maksimal 25 karakter.");
  return { idGroup, idGrade, tebal, lebar, produk };
}

function validateKey(data) {
  const idGroup = num(data?.idGroup);
  const idGrade = num(data?.idGrade);
  const tebal = num(data?.tebal);
  const lebar = num(data?.lebar);
  if (!Number.isInteger(idGroup)) throw httpError(400, "Group kayu harus dipilih.");
  if (!Number.isInteger(idGrade)) throw httpError(400, "Grade harus dipilih.");
  if (Number.isNaN(tebal)) throw httpError(400, "Tebal harus angka.");
  if (Number.isNaN(lebar)) throw httpError(400, "Lebar harus angka.");
  return { idGroup, idGrade, tebal, lebar };
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
    SELECT ROW_NUMBER() OVER (ORDER BY A.IdGroup ASC, A.IdGrade ASC, A.Tebal ASC, A.Lebar ASC) AS RowNum,
           A.IdGroup, B.[Group], A.IdGrade, C.NamaGrade, A.Tebal, A.Lebar, A.Produk
    FROM MstWIPTebalLebarGradeProduk A
    INNER JOIN MstGroupJenisKayu B ON B.IdGroup = A.IdGroup
    INNER JOIN MstGrade C ON C.IdGrade = A.IdGrade
    ORDER BY A.IdGroup ASC, A.IdGrade ASC, A.Tebal ASC, A.Lebar ASC
  `);
  return rs.recordset;
}

async function getLookups() {
  const pool = await poolPromise;
  const [g, gr] = await Promise.all([
    pool.request().query(`SELECT IdGroup, [Group] FROM MstGroupJenisKayu ORDER BY [Group] ASC`),
    pool.request().query(`SELECT IdGrade, NamaGrade FROM MstGrade ORDER BY NamaGrade ASC`),
  ]);
  return { groupKayu: g.recordset, grade: gr.recordset };
}

async function create(data, user) {
  const v = validateValues(data);
  return withTx(async (tx) => {
    const dup = await new sql.Request(tx)
      .input("g", sql.Int, v.idGroup)
      .input("r", sql.Int, v.idGrade)
      .input("t", sql.Float, v.tebal)
      .input("l", sql.Float, v.lebar)
      .query(`SELECT TOP 1 1 AS dup FROM MstWIPTebalLebarGradeProduk WHERE IdGroup = @g AND IdGrade = @r AND Tebal = @t AND Lebar = @l`);
    if (dup.recordset.length) throw httpError(409, "Baris WIP untuk group, grade, tebal dan lebar tersebut sudah ada.");
    await new sql.Request(tx)
      .input("g", sql.Int, v.idGroup)
      .input("r", sql.Int, v.idGrade)
      .input("t", sql.Float, v.tebal)
      .input("l", sql.Float, v.lebar)
      .input("p", sql.VarChar(25), v.produk)
      .query(`INSERT INTO MstWIPTebalLebarGradeProduk (IdGroup, IdGrade, Tebal, Lebar, Produk) VALUES (@g, @r, @t, @l, @p)`);
    await audit(tx, user, `Menyimpan Data Master WIP Tebal Lebar Grade Produk ${v.produk} (Web)`);
    return { idGroup: v.idGroup, idGrade: v.idGrade, tebal: v.tebal, lebar: v.lebar };
  });
}

async function update(body, user) {
  const oldKey = validateKey(body?.old || {});
  const v = validateValues(body?.new || body || {});
  return withTx(async (tx) => {
    const r = await new sql.Request(tx)
      .input("og", sql.Int, oldKey.idGroup)
      .input("or", sql.Int, oldKey.idGrade)
      .input("ot", sql.Float, oldKey.tebal)
      .input("ol", sql.Float, oldKey.lebar)
      .input("g", sql.Int, v.idGroup)
      .input("r", sql.Int, v.idGrade)
      .input("t", sql.Float, v.tebal)
      .input("l", sql.Float, v.lebar)
      .input("p", sql.VarChar(25), v.produk)
      .query(`UPDATE MstWIPTebalLebarGradeProduk SET IdGroup = @g, IdGrade = @r, Tebal = @t, Lebar = @l, Produk = @p
              WHERE IdGroup = @og AND IdGrade = @or AND Tebal = @ot AND Lebar = @ol`);
    if (!r.rowsAffected[0]) throw httpError(404, "Baris WIP tidak ditemukan (key lama tidak cocok).");
    await audit(tx, user, `Mengubah Data Master WIP Tebal Lebar Grade Produk ${v.produk} (Web)`);
    return { idGroup: v.idGroup, idGrade: v.idGrade, tebal: v.tebal, lebar: v.lebar };
  });
}

async function remove(body, user) {
  const k = validateKey(body || {});
  try {
    return await withTx(async (tx) => {
      const r = await new sql.Request(tx)
        .input("g", sql.Int, k.idGroup)
        .input("r", sql.Int, k.idGrade)
        .input("t", sql.Float, k.tebal)
        .input("l", sql.Float, k.lebar)
        .query(`DELETE FROM MstWIPTebalLebarGradeProduk WHERE IdGroup = @g AND IdGrade = @r AND Tebal = @t AND Lebar = @l`);
      if (!r.rowsAffected[0]) throw httpError(404, "Baris WIP tidak ditemukan.");
      await audit(tx, user, `Menghapus Data Master WIP Tebal Lebar Grade Produk (Web)`);
      return { idGroup: k.idGroup, idGrade: k.idGrade, tebal: k.tebal, lebar: k.lebar };
    });
  } catch (err) {
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(409, "Baris WIP masih dipakai pada data lain dan tidak dapat dihapus.");
    }
    throw err;
  }
}

module.exports = { getAll, getLookups, create, update, remove };
