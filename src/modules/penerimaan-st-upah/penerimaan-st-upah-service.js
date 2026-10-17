const { sql, poolPromise } = require("../../core/config/db");

const HEADER = "PenerimaanSTUpah_h";
const LABEL = "PenerimaanSTUpah_d";

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

/* ============================================================
 * LIST / DETAIL (paritas getSTUpahData tablet)
 * ==========================================================*/

const SELECT_HEADER = `
  SELECT
    p.NoPenerimaanST, p.TglMasuk, p.IdCustomer, c.NamaCustomer AS Customer,
    p.NoPlat, p.NoTruk, p.NoSJ, p.Note
  FROM ${HEADER} p
  LEFT JOIN MstCustomerUpah c ON c.IdCustomer = p.IdCustomer
`;

async function getAll({ search } = {}) {
  const pool = await poolPromise;
  const req = pool.request();
  const keyword = String(search || "").trim();
  let where = "";
  if (keyword) {
    req.input("kw", sql.VarChar(100), `%${keyword}%`);
    where = `WHERE p.NoPenerimaanST LIKE @kw OR c.NamaCustomer LIKE @kw OR p.NoPlat LIKE @kw OR p.NoTruk LIKE @kw OR p.NoSJ LIKE @kw`;
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

async function getCustomers() {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .query(`SELECT IdCustomer, NamaCustomer FROM MstCustomerUpah ORDER BY NamaCustomer`);
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

/* ============================================================
 * CREATE / UPDATE / DELETE
 * ==========================================================*/

// Paritas getNextNoPenerimaanSTUpah tablet: prefix "O.", 6 digit.
async function nextNo(transaction) {
  const result = await new sql.Request(transaction).query(`
    SELECT TOP 1 NoPenerimaanST FROM ${HEADER} WITH (UPDLOCK, HOLDLOCK)
    WHERE NoPenerimaanST LIKE 'O.%'
    ORDER BY NoPenerimaanST DESC
  `);
  const last = result.recordset[0]?.NoPenerimaanST;
  const n = last ? parseInt(String(last).slice(2), 10) : 0;
  return `O.${String((Number.isFinite(n) ? n : 0) + 1).padStart(6, "0")}`;
}

function bindHeader(req, d) {
  req.input("tglMasuk", sql.Date, d.tglLaporan || null);
  req.input("idCustomer", sql.Int, Number(d.idCustomer));
  req.input("noPlat", sql.VarChar(50), String(d.noPlat).trim());
  req.input("noTruk", sql.VarChar(50), String(d.noTruk).trim());
  req.input("noSJ", sql.VarChar(100), String(d.noSJ).trim());
  req.input("note", sql.VarChar(50), d.note ? String(d.note).slice(0, 50) : null);
}

function validateHeader(d) {
  if (!d.tglLaporan) throw httpError(400, "Tanggal wajib diisi");
  if (!Number.isInteger(Number(d.idCustomer)) || Number(d.idCustomer) <= 0) {
    throw httpError(400, "Customer wajib dipilih");
  }
  if (!String(d.noTruk ?? "").trim()) throw httpError(400, "Nomor Truk harus diisi");
  if (!String(d.noPlat ?? "").trim()) throw httpError(400, "Nomor Plat harus diisi");
  if (!String(d.noSJ ?? "").trim()) throw httpError(400, "No. SJ harus diisi");
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
        (NoPenerimaanST, TglMasuk, IdCustomer, NoPlat, NoTruk, NoSJ, Note)
      VALUES
        (@no, @tglMasuk, @idCustomer, @noPlat, @noTruk, @noSJ, @note)
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
    SET TglMasuk = @tglMasuk, IdCustomer = @idCustomer,
        NoPlat = @noPlat, NoTruk = @noTruk, NoSJ = @noSJ, Note = @note
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
  await pool.request().input("no", sql.VarChar(50), no).query(`DELETE FROM ${HEADER} WHERE NoPenerimaanST = @no`);
  return { noPenerimaanST: no };
}

module.exports = { getAll, getByNo, getCustomers, getLabels, create, update, remove };
