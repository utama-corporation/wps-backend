const { sql, poolPromise } = require("../../core/config/db");

const HEADER = "PenerimaanSTPembelian_h";
const LABEL = "PenerimaanSTPembelian_d";
const REJECT = "PenerimaanSTPembelian_Reject";

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

// Paritas tablet hitungTon: floor 4 desimal
function hitungTon(tebal, lebar, panjang, pcs, idUOMTblLebar) {
  const t = Number(tebal) || 0;
  const l = Number(lebar) || 0;
  const p = Number(panjang) || 0;
  const n = Number(pcs) || 0;
  const raw =
    Number(idUOMTblLebar) === 1
      ? (t * l * p * n * 304.8) / 1000000000 / 1.416
      : (t * l * p * n) / 7200.8;
  return Math.floor(raw * 10000) / 10000;
}

/* ============================================================
 * LIST / DETAIL
 * ==========================================================*/

const SELECT_HEADER = `
  SELECT
    p.NoPenerimaanST, p.TglLaporan, p.TglMasuk, p.IdSupplier, s.NmSupplier AS Supplier,
    p.NoTruk, p.NoPlat, p.Suket, p.TonSJ, p.Note, p.IsKering,
    p.IdTanah, t.NamaTanah AS SuratTanah
  FROM ${HEADER} p
  LEFT JOIN MstSupplier s ON s.IdSupplier = p.IdSupplier
  LEFT JOIN MstSuratTanah t ON t.IdTanah = p.IdTanah
`;

async function getAll({ search } = {}) {
  const pool = await poolPromise;
  const req = pool.request();
  const keyword = String(search || "").trim();
  let where = "";
  if (keyword) {
    req.input("kw", sql.VarChar(100), `%${keyword}%`);
    where = `WHERE p.NoPenerimaanST LIKE @kw OR s.NmSupplier LIKE @kw OR p.NoPlat LIKE @kw OR p.NoTruk LIKE @kw`;
  }
  const result = await req.query(`${SELECT_HEADER} ${where} ORDER BY p.NoPenerimaanST DESC`);
  return result.recordset;
}

async function getByNo(no) {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("no", sql.VarChar(50), no)
    .query(`${SELECT_HEADER} WHERE p.NoPenerimaanST = @no`);
  return result.recordset[0] || null;
}

async function getSuppliers() {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .query(`SELECT IdSupplier, NmSupplier FROM MstSupplier WHERE enable = 1 ORDER BY NmSupplier`);
  return result.recordset;
}

async function getSuratTanah() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT IdTanah AS id, NamaTanah AS nama
    FROM MstSuratTanah
    ORDER BY NamaTanah ASC
  `);
  return result.recordset;
}

async function getLabels(no) {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("no", sql.VarChar(50), no)
    .query(`SELECT NoST FROM ${LABEL} WHERE NoPenerimaanST = @no ORDER BY NoST`);
  return result.recordset.map((r) => r.NoST);
}

async function getRejects(no) {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("no", sql.VarChar(50), no)
    .query(`
      SELECT NoUrut, Tebal, Lebar, Panjang, JmlhBatang, IdUOMTblLebar, IdUOMPanjang, Ton
      FROM ${REJECT}
      WHERE NoPenerimaanST = @no
      ORDER BY NoUrut
    `);
  return result.recordset;
}

/* ============================================================
 * CREATE / UPDATE / DELETE
 * ==========================================================*/

async function nextNo(transaction) {
  const result = await new sql.Request(transaction).query(`
    SELECT TOP 1 NoPenerimaanST FROM ${HEADER} WITH (UPDLOCK, HOLDLOCK)
    WHERE NoPenerimaanST LIKE 'B.%'
    ORDER BY NoPenerimaanST DESC
  `);
  const last = result.recordset[0]?.NoPenerimaanST;
  const n = last ? parseInt(String(last).slice(2), 10) : 0;
  return `B.${String((Number.isFinite(n) ? n : 0) + 1).padStart(6, "0")}`;
}

function bindHeader(req, d) {
  req.input("tglLaporan", sql.Date, d.tglLaporan || null);
  req.input("tglMasuk", sql.Date, d.tglMasuk || null);
  req.input("idSupplier", sql.Int, Number(d.idSupplier));
  req.input("idTanah", sql.Int, d.idTanah ? Number(d.idTanah) : null);
  req.input("noTruk", sql.VarChar(50), String(d.noTruk).trim());
  req.input("noPlat", sql.VarChar(50), String(d.noPlat).trim());
  req.input("suket", sql.VarChar(100), String(d.suket).trim());
  req.input("tonSJ", sql.VarChar(50), String(d.tonSJ).trim());
  req.input("note", sql.VarChar(100), d.note ? String(d.note).slice(0, 100) : null);
  // 1 = Kering, 0 = Basah, NULL = tidak ditentukan.
  const k = d.isKering;
  req.input("isKering", sql.Bit, k === null || k === undefined || k === "" ? null : k === true || k === 1 || k === "1" || k === "true" ? 1 : 0);
}

function validateHeader(d) {
  if (!d.tglLaporan || !d.tglMasuk) throw httpError(400, "Tanggal wajib diisi");
  if (!Number.isInteger(Number(d.idSupplier)) || Number(d.idSupplier) <= 0) {
    throw httpError(400, "Supplier wajib dipilih");
  }
  if (!String(d.noTruk ?? "").trim()) throw httpError(400, "Nomor Truk harus diisi");
  if (!String(d.noPlat ?? "").trim()) throw httpError(400, "Nomor Plat harus diisi");
  if (!String(d.suket ?? "").trim()) throw httpError(400, "Suket harus diisi");
  if (!String(d.tonSJ ?? "").trim()) throw httpError(400, "Ton SJ harus diisi");
}

async function create(data) {
  validateHeader(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const noPenerimaanST = await nextNo(transaction);
    const req = new sql.Request(transaction);
    req.input("no", sql.VarChar(50), noPenerimaanST);
    bindHeader(req, data);
    await req.query(`
      INSERT INTO ${HEADER}
        (NoPenerimaanST, TglLaporan, TglMasuk, IdSupplier, IdTanah, NoTruk, NoPlat, Suket, TonSJ, Note, IsKering)
      VALUES
        (@no, @tglLaporan, @tglMasuk, @idSupplier, @idTanah, @noTruk, @noPlat, @suket, @tonSJ, @note, @isKering)
    `);
    await transaction.commit();
    return { noPenerimaanST };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function update(no, data) {
  validateHeader(data);
  const existing = await getByNo(no);
  if (!existing) throw httpError(404, "Penerimaan ST tidak ditemukan");
  const pool = await poolPromise;
  const req = pool.request();
  req.input("no", sql.VarChar(50), no);
  bindHeader(req, data);
  await req.query(`
    UPDATE ${HEADER}
    SET TglLaporan = @tglLaporan, TglMasuk = @tglMasuk, IdSupplier = @idSupplier, IdTanah = @idTanah,
        NoTruk = @noTruk, NoPlat = @noPlat, Suket = @suket, TonSJ = @tonSJ, Note = @note, IsKering = @isKering
    WHERE NoPenerimaanST = @no
  `);
  return { noPenerimaanST: no };
}

async function remove(no) {
  const existing = await getByNo(no);
  if (!existing) throw httpError(404, "Penerimaan ST tidak ditemukan");
  const labels = await getLabels(no);
  if (labels.length > 0) {
    throw httpError(
      409,
      `Penerimaan ${no} sudah memiliki ${labels.length} label ST. Hapus label ST terlebih dahulu.`,
    );
  }
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    for (const table of [REJECT, HEADER]) {
      const req = new sql.Request(transaction);
      req.input("no", sql.VarChar(50), no);
      await req.query(`DELETE FROM ${table} WHERE NoPenerimaanST = @no`);
    }
    await transaction.commit();
    return { noPenerimaanST: no };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/* ============================================================
 * REJECT (paritas tablet: NoUrut = jumlah reject + 1, Ton floor 4 desimal)
 * ==========================================================*/

function parseNoUrut(value) {
  const noUrut = parseInt(value, 10);
  if (!(noUrut > 0)) throw httpError(400, "NoUrut reject tidak valid");
  return noUrut;
}

function validateReject(d) {
  const tebal = Number(d.tebal);
  const lebar = Number(d.lebar);
  const panjang = Number(d.panjang);
  const pcs = parseInt(d.pcs ?? d.jmlhBatang, 10);
  if (![tebal, lebar, panjang].every((v) => Number.isFinite(v) && v > 0) || !(pcs > 0)) {
    throw httpError(400, "Tebal, lebar, panjang, dan pcs harus diisi dengan benar");
  }
  const idUOMTblLebar = Number(d.idUOMTblLebar) === 1 ? 1 : 3;
  return { tebal, lebar, panjang, pcs, idUOMTblLebar };
}

async function addReject(no, d) {
  const existing = await getByNo(no);
  if (!existing) throw httpError(404, "Penerimaan ST tidak ditemukan");

  const { tebal, lebar, panjang, pcs, idUOMTblLebar } = validateReject(d);
  const idUOMPanjang = 4;
  const ton = hitungTon(tebal, lebar, panjang, pcs, idUOMTblLebar);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const seq = await new sql.Request(transaction)
      .input("no", sql.VarChar(50), no)
      .query(
        `SELECT ISNULL(MAX(NoUrut), 0) + 1 AS NoUrut FROM ${REJECT} WITH (UPDLOCK, HOLDLOCK) WHERE NoPenerimaanST = @no`,
      );
    const noUrut = seq.recordset[0].NoUrut;

    const req = new sql.Request(transaction);
    req.input("no", sql.VarChar(50), no);
    req.input("noUrut", sql.Int, noUrut);
    req.input("tebal", sql.Decimal(18, 4), tebal);
    req.input("lebar", sql.Decimal(18, 4), lebar);
    req.input("panjang", sql.Decimal(18, 4), panjang);
    req.input("pcs", sql.Int, pcs);
    req.input("uomTl", sql.Int, idUOMTblLebar);
    req.input("uomP", sql.Int, idUOMPanjang);
    req.input("ton", sql.Decimal(18, 4), ton);
    await req.query(`
      INSERT INTO ${REJECT}
        (NoPenerimaanST, NoUrut, Tebal, Lebar, Panjang, JmlhBatang, IdUOMTblLebar, IdUOMPanjang, Ton)
      VALUES (@no, @noUrut, @tebal, @lebar, @panjang, @pcs, @uomTl, @uomP, @ton)
    `);
    await transaction.commit();
    return { noPenerimaanST: no, noUrut, ton };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function updateReject(no, noUrutValue, d) {
  const noUrut = parseNoUrut(noUrutValue);
  const existing = await getByNo(no);
  if (!existing) throw httpError(404, "Penerimaan ST tidak ditemukan");

  const { tebal, lebar, panjang, pcs, idUOMTblLebar } = validateReject(d);
  const pool = await poolPromise;
  const current = await pool
    .request()
    .input("no", sql.VarChar(50), no)
    .input("noUrut", sql.Int, noUrut)
    .query(`SELECT IdUOMPanjang FROM ${REJECT} WHERE NoPenerimaanST = @no AND NoUrut = @noUrut`);
  const row = current.recordset[0];
  if (!row) throw httpError(404, "Reject tidak ditemukan");

  const idUOMPanjang = Number(row.IdUOMPanjang) > 0 ? Number(row.IdUOMPanjang) : 4;
  const ton = hitungTon(tebal, lebar, panjang, pcs, idUOMTblLebar);
  const req = pool
    .request()
    .input("no", sql.VarChar(50), no)
    .input("noUrut", sql.Int, noUrut)
    .input("tebal", sql.Decimal(18, 4), tebal)
    .input("lebar", sql.Decimal(18, 4), lebar)
    .input("panjang", sql.Decimal(18, 4), panjang)
    .input("pcs", sql.Int, pcs)
    .input("uomTl", sql.Int, idUOMTblLebar)
    .input("uomP", sql.Int, idUOMPanjang)
    .input("ton", sql.Decimal(18, 4), ton);
  const result = await req.query(`
    UPDATE ${REJECT}
    SET Tebal = @tebal, Lebar = @lebar, Panjang = @panjang, JmlhBatang = @pcs,
        IdUOMTblLebar = @uomTl, IdUOMPanjang = @uomP, Ton = @ton
    WHERE NoPenerimaanST = @no AND NoUrut = @noUrut
  `);
  if (!result.rowsAffected[0]) throw httpError(404, "Reject tidak ditemukan");
  return { noPenerimaanST: no, noUrut, ton };
}

async function removeReject(no, noUrutValue) {
  const noUrut = parseNoUrut(noUrutValue);
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("no", sql.VarChar(50), no)
    .input("noUrut", sql.Int, noUrut)
    .query(`DELETE FROM ${REJECT} WHERE NoPenerimaanST = @no AND NoUrut = @noUrut`);
  if (!result.rowsAffected[0]) throw httpError(404, "Reject tidak ditemukan");
  return { noPenerimaanST: no, noUrut };
}

module.exports = {
  hitungTon,
  getAll,
  getByNo,
  getSuppliers,
  getSuratTanah,
  getLabels,
  getRejects,
  create,
  update,
  remove,
  addReject,
  updateReject,
  removeReject,
};
