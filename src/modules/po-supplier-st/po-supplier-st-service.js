const { sql, poolPromise } = require("../../core/config/db");

const HEADER = "POSupplierST_h";
const DETAIL = "POSupplierST_d";
const RECEIPT = "PenerimaanSTPembelian_h";
const RECEIPT_LABEL = "PenerimaanSTPembelian_d";

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const round2 = (n) => Math.round(n * 100) / 100;
const same = (a, b) => Math.abs(Number(a) - Number(b)) < 0.001;

async function inTransaction(fn) {
  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (err) {
    try {
      await tx.rollback();
    } catch (_) {
      /* transaksi sudah dibatalkan server */
    }
    throw err;
  }
}

const request = (tx) => new sql.Request(tx);

/* ============================================================
 * REALISASI
 * ==========================================================*/

/** Cocok per baris: jenis kayu + ukuran. Panjang selalu feet. */
function matches(line, item) {
  return (
    Number(line.IdJenisKayu) === Number(item.IdJenisKayu) &&
    Number(line.IdUOMTblLebar) === Number(item.IdUOMTblLebar) &&
    same(line.Tebal, item.Tebal) &&
    same(line.Lebar, item.Lebar) &&
    same(line.Panjang, item.Panjang)
  );
}

/** Hitung realisasi (pcs) per baris PO dari rincian label ST. Barang tak cocok masuk `outside`. */
function computeRealisasi(lines, items) {
  const result = lines.map((l) => ({ ...l, RealPcs: 0 }));
  const outsideMap = new Map();

  for (const item of items) {
    const pcs = Number(item.JmlhBatang) || 0;
    const line = result.find((l) => matches(l, item));
    if (line) {
      line.RealPcs += pcs;
      continue;
    }
    const key = [item.IdJenisKayu, item.IdUOMTblLebar, item.Tebal, item.Lebar, item.Panjang].join("|");
    const cur = outsideMap.get(key) || {
      IdJenisKayu: item.IdJenisKayu,
      JenisKayu: item.JenisKayu,
      Tebal: item.Tebal,
      Lebar: item.Lebar,
      Panjang: item.Panjang,
      IdUOMTblLebar: item.IdUOMTblLebar,
      Pcs: 0,
    };
    cur.Pcs += pcs;
    outsideMap.set(key, cur);
  }

  for (const l of result) {
    const target = Number(l.JmlhBatang) || 0;
    l.Sisa = target - l.RealPcs; // negatif = melebihi PO
    l.Persen = target > 0 ? Math.round((l.RealPcs / target) * 1000) / 10 : 0;
  }

  const progres = !items.length
    ? "BELUM"
    : result.every((l) => l.Sisa <= 0)
      ? "TERPENUHI"
      : "SEBAGIAN";

  return { lines: result, outside: [...outsideMap.values()], progres };
}

async function getLines(no) {
  const pool = await poolPromise;
  const r = await pool.request().input("no", sql.VarChar(13), no).query(`
    SELECT d.NoUrut, d.IdJenisKayu, k.Jenis AS JenisKayu, d.Tebal, d.Lebar, d.Panjang,
           d.JmlhBatang, d.IdUOMTblLebar
    FROM ${DETAIL} d
    LEFT JOIN MstJenisKayu k ON k.IdJenisKayu = d.IdJenisKayu
    WHERE d.NoPO = @no
    ORDER BY d.NoUrut
  `);
  return r.recordset;
}

/** Rincian ukuran semua label ST pada penerimaan yang terhubung ke PO (reject tidak ikut). */
async function getDeliveredItems(no) {
  const pool = await poolPromise;
  const r = await pool.request().input("no", sql.VarChar(13), no).query(`
    SELECT p.NoPenerimaanST, h.NoST, h.IdJenisKayu, k.Jenis AS JenisKayu,
           h.IdUOMTblLebar, d.Tebal, d.Lebar, d.Panjang, d.JmlhBatang
    FROM ${RECEIPT} p
    INNER JOIN ${RECEIPT_LABEL} pd ON pd.NoPenerimaanST = p.NoPenerimaanST
    INNER JOIN ST_h h ON h.NoST = pd.NoST
    INNER JOIN ST_d d ON d.NoST = h.NoST
    LEFT JOIN MstJenisKayu k ON k.IdJenisKayu = h.IdJenisKayu
    WHERE p.NoPO = @no
  `);
  return r.recordset;
}

async function getReceipts(no) {
  const pool = await poolPromise;
  const r = await pool.request().input("no", sql.VarChar(13), no).query(`
    SELECT p.NoPenerimaanST, p.TglMasuk, p.NoPlat, p.NoTruk,
           (SELECT COUNT(1) FROM ${RECEIPT_LABEL} x WHERE x.NoPenerimaanST = p.NoPenerimaanST) AS JmlLabel
    FROM ${RECEIPT} p
    WHERE p.NoPO = @no
    ORDER BY p.NoPenerimaanST
  `);
  return r.recordset;
}

/* ============================================================
 * LIST / DETAIL / MASTER
 * ==========================================================*/

const SELECT_HEADER = `
  SELECT h.NoPO, h.TglPO, h.TglKirim, h.IdSupplier, s.NmSupplier AS Supplier, h.Note,
         STUFF((
           SELECT DISTINCT ', ' + k.Jenis
           FROM ${DETAIL} d
           INNER JOIN MstJenisKayu k ON k.IdJenisKayu = d.IdJenisKayu
           WHERE d.NoPO = h.NoPO
           FOR XML PATH(''), TYPE
         ).value('.', 'nvarchar(max)'), 1, 2, '') AS JenisKayu,
         h.IsClosed, h.TglClose,
         (SELECT COUNT(1) FROM ${RECEIPT} p WHERE p.NoPO = h.NoPO) AS JmlPenerimaan
  FROM ${HEADER} h
  LEFT JOIN MstSupplier s ON s.IdSupplier = h.IdSupplier
`;

async function getAll({ search, idSupplier, status, page, limit } = {}) {
  const pool = await poolPromise;
  const p = Math.max(parseInt(page, 10) || 1, 1);
  const size = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

  const conditions = [];
  const bind = (req) => {
    const keyword = String(search || "").trim();
    if (keyword) req.input("kw", sql.VarChar(100), `%${keyword}%`);
    if (Number(idSupplier) > 0) req.input("idSupplier", sql.Int, Number(idSupplier));
    return req;
  };
  if (String(search || "").trim()) conditions.push("(h.NoPO LIKE @kw OR s.NmSupplier LIKE @kw)");
  if (Number(idSupplier) > 0) conditions.push("h.IdSupplier = @idSupplier");
  if (status === "open") conditions.push("h.IsClosed = 0");
  if (status === "closed") conditions.push("h.IsClosed = 1");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const list = await bind(pool.request())
    .input("offset", sql.Int, (p - 1) * size)
    .input("size", sql.Int, size)
    .query(`${SELECT_HEADER} ${where} ORDER BY h.NoPO DESC OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY`);
  const count = await bind(pool.request()).query(`
    SELECT COUNT(1) AS Total FROM ${HEADER} h
    LEFT JOIN MstSupplier s ON s.IdSupplier = h.IdSupplier ${where}
  `);
  const total = count.recordset[0].Total;
  return { data: list.recordset, page: p, limit: size, total, totalPages: Math.ceil(total / size) };
}

async function getHeader(no) {
  const pool = await poolPromise;
  const r = await pool
    .request()
    .input("no", sql.VarChar(13), no)
    .query(`${SELECT_HEADER} WHERE h.NoPO = @no`);
  return r.recordset[0] || null;
}

async function getByNo(no) {
  const header = await getHeader(no);
  if (!header) throw httpError(404, "PO tidak ditemukan");
  const [lines, items, receipts] = await Promise.all([getLines(no), getDeliveredItems(no), getReceipts(no)]);
  return { header, ...computeRealisasi(lines, items), receipts };
}

/** PO Open milik satu supplier (pilihan di form ST Pembelian). */
async function getOpenBySupplier(idSupplier) {
  const pool = await poolPromise;
  const r = await pool.request().input("idSupplier", sql.Int, Number(idSupplier) || 0).query(`
    SELECT NoPO, TglPO, TglKirim, Note
    FROM ${HEADER}
    WHERE IsClosed = 0 AND IdSupplier = @idSupplier
    ORDER BY NoPO DESC
  `);
  return r.recordset;
}

async function getMasters() {
  const pool = await poolPromise;
  const [supplier, jenisKayu] = await Promise.all([
    pool.request().query("SELECT IdSupplier, NmSupplier FROM MstSupplier WHERE [Enable] = 1 ORDER BY NmSupplier"),
    pool.request().query("SELECT IdJenisKayu, Jenis FROM MstJenisKayu WHERE IsST = 1 AND [Enable] = 1 ORDER BY Jenis"),
  ]);
  return { supplier: supplier.recordset, jenisKayu: jenisKayu.recordset };
}

/* ============================================================
 * VALIDASI
 * ==========================================================*/

function normalizeLines(raw) {
  if (!Array.isArray(raw) || raw.length === 0) throw httpError(400, "Minimal 1 baris ukuran PO");
  const lines = raw.map((d, i) => {
    const baris = `Baris ${i + 1}`;
    const idJenisKayu = Number(d.idJenisKayu);
    if (!Number.isInteger(idJenisKayu) || idJenisKayu <= 0) {
      throw httpError(400, `${baris}: jenis kayu wajib dipilih`);
    }
    const tebal = round2(Number(d.tebal));
    const lebar = round2(Number(d.lebar));
    const panjang = round2(Number(d.panjang));
    const jmlhBatang = Number(d.jmlhBatang);
    if (!(tebal > 0) || !(lebar > 0) || !(panjang > 0)) {
      throw httpError(400, `${baris}: tebal, lebar, dan panjang harus lebih dari 0`);
    }
    if (!Number.isInteger(jmlhBatang) || jmlhBatang <= 0) {
      throw httpError(400, `${baris}: pcs harus bilangan bulat lebih dari 0`);
    }
    return { idJenisKayu, tebal, lebar, panjang, jmlhBatang, idUOMTblLebar: Number(d.idUOMTblLebar) === 1 ? 1 : 3 };
  });

  // Jenis + ukuran tidak boleh dobel: satu label hanya boleh cocok dengan satu baris.
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i];
      const b = lines[j];
      if (
        a.idJenisKayu === b.idJenisKayu &&
        a.idUOMTblLebar === b.idUOMTblLebar &&
        same(a.tebal, b.tebal) &&
        same(a.lebar, b.lebar) &&
        same(a.panjang, b.panjang)
      ) {
        throw httpError(400, `Baris ${i + 1} dan ${j + 1} jenis kayu dan ukurannya sama`);
      }
    }
  }
  return lines;
}

function validateHeader(d) {
  if (!d.tglPO) throw httpError(400, "Tanggal PO wajib diisi");
  if (d.tglKirim && String(d.tglKirim) < String(d.tglPO)) {
    throw httpError(400, "Tanggal kirim tidak boleh sebelum tanggal PO");
  }
  if (!Number.isInteger(Number(d.idSupplier)) || Number(d.idSupplier) <= 0) {
    throw httpError(400, "Supplier wajib dipilih");
  }
}

function bindHeader(req, d) {
  req.input("tglPO", sql.Date, d.tglPO);
  req.input("tglKirim", sql.Date, d.tglKirim || null);
  req.input("idSupplier", sql.Int, Number(d.idSupplier));
  req.input("note", sql.NVarChar(100), d.note ? String(d.note).slice(0, 100) : null);
}

async function assertSupplierAktif(tx, idSupplier) {
  const r = await request(tx)
    .input("id", sql.Int, Number(idSupplier))
    .query("SELECT 1 AS x FROM MstSupplier WHERE IdSupplier = @id AND [Enable] = 1");
  if (!r.recordset.length) throw httpError(400, "Supplier tidak ditemukan atau tidak aktif");
}

/** Kunci baris PO sampai transaksi selesai. */
async function lockPO(tx, no) {
  const r = await request(tx).input("no", sql.VarChar(13), no).query(`
    SELECT NoPO, IdSupplier, IsClosed FROM ${HEADER} WITH (UPDLOCK, HOLDLOCK) WHERE NoPO = @no
  `);
  if (!r.recordset.length) throw httpError(404, "PO tidak ditemukan");
  return r.recordset[0];
}

async function countReceipts(tx, no) {
  const r = await request(tx)
    .input("no", sql.VarChar(13), no)
    .query(`SELECT COUNT(1) AS n FROM ${RECEIPT} WHERE NoPO = @no`);
  return r.recordset[0].n;
}

/**
 * Dipakai ST Pembelian: pastikan PO boleh dihubungkan.
 * PO Closed hanya boleh bila memang sudah terhubung sebelumnya (currentNoPO).
 */
async function assertPOUsable(tx, noPO, idSupplier, currentNoPO = null) {
  if (!noPO) return;
  const r = await request(tx).input("no", sql.VarChar(13), noPO).query(`
    SELECT IdSupplier, IsClosed FROM ${HEADER} WITH (UPDLOCK, HOLDLOCK) WHERE NoPO = @no
  `);
  const po = r.recordset[0];
  if (!po) throw httpError(400, `PO ${noPO} tidak ditemukan`);
  if (Number(po.IdSupplier) !== Number(idSupplier)) {
    throw httpError(400, `PO ${noPO} milik supplier lain`);
  }
  if (po.IsClosed && noPO !== currentNoPO) throw httpError(409, `PO ${noPO} sudah ditutup`);
}

/* ============================================================
 * CREATE / UPDATE / DELETE / CLOSE
 * ==========================================================*/

async function nextNo(tx) {
  const r = await request(tx).query(`
    SELECT TOP 1 NoPO FROM ${HEADER} WITH (UPDLOCK, HOLDLOCK)
    WHERE NoPO LIKE 'PO.%'
    ORDER BY NoPO DESC
  `);
  const last = r.recordset[0]?.NoPO;
  const n = last ? parseInt(String(last).slice(3), 10) : 0;
  return `PO.${String((Number.isFinite(n) ? n : 0) + 1).padStart(6, "0")}`;
}

async function insertLines(tx, no, lines) {
  for (let i = 0; i < lines.length; i++) {
    const d = lines[i];
    await request(tx)
      .input("no", sql.VarChar(13), no)
      .input("noUrut", sql.Int, i + 1)
      .input("idJenisKayu", sql.Int, d.idJenisKayu)
      .input("tebal", sql.Decimal(18, 2), d.tebal)
      .input("lebar", sql.Decimal(18, 2), d.lebar)
      .input("panjang", sql.Decimal(18, 2), d.panjang)
      .input("jmlhBatang", sql.Int, d.jmlhBatang)
      .input("uomTl", sql.Int, d.idUOMTblLebar).query(`
        INSERT INTO ${DETAIL} (NoPO, NoUrut, IdJenisKayu, Tebal, Lebar, Panjang, JmlhBatang, IdUOMTblLebar)
        VALUES (@no, @noUrut, @idJenisKayu, @tebal, @lebar, @panjang, @jmlhBatang, @uomTl)
      `);
  }
}

async function linesChanged(tx, no, lines) {
  const r = await request(tx).input("no", sql.VarChar(13), no).query(`
    SELECT IdJenisKayu, Tebal, Lebar, Panjang, JmlhBatang, IdUOMTblLebar
    FROM ${DETAIL} WHERE NoPO = @no ORDER BY NoUrut
  `);
  const sign = (...values) => values.map(Number).join("|");
  const before = r.recordset.map((x) => sign(x.IdJenisKayu, x.Tebal, x.Lebar, x.Panjang, x.JmlhBatang, x.IdUOMTblLebar));
  const after = lines.map((x) => sign(x.idJenisKayu, x.tebal, x.lebar, x.panjang, x.jmlhBatang, x.idUOMTblLebar));
  return before.join(";") !== after.join(";");
}

async function create(data, idUser) {
  validateHeader(data);
  const lines = normalizeLines(data.details);
  return inTransaction(async (tx) => {
    await assertSupplierAktif(tx, data.idSupplier);
    const noPO = await nextNo(tx);
    const req = request(tx).input("no", sql.VarChar(13), noPO).input("idUser", sql.Int, Number(idUser) || null);
    bindHeader(req, data);
    await req.query(`
      INSERT INTO ${HEADER} (NoPO, TglPO, TglKirim, IdSupplier, Note, IdUserCreate)
      VALUES (@no, @tglPO, @tglKirim, @idSupplier, @note, @idUser)
    `);
    await insertLines(tx, noPO, lines);
    return { noPO };
  });
}

async function update(no, data) {
  validateHeader(data);
  const lines = normalizeLines(data.details);
  return inTransaction(async (tx) => {
    const po = await lockPO(tx, no);
    if (po.IsClosed) throw httpError(409, "PO sudah ditutup. Buka kembali sebelum diubah.");
    if (Number(po.IdSupplier) !== Number(data.idSupplier)) {
      if ((await countReceipts(tx, no)) > 0) {
        throw httpError(409, "Supplier tidak bisa diganti karena PO sudah punya penerimaan");
      }
      await assertSupplierAktif(tx, data.idSupplier);
    }
    const req = request(tx).input("no", sql.VarChar(13), no);
    bindHeader(req, data);
    await req.query(`
      UPDATE ${HEADER}
      SET TglPO = @tglPO, TglKirim = @tglKirim, IdSupplier = @idSupplier, Note = @note
      WHERE NoPO = @no
    `);
    if (await linesChanged(tx, no, lines)) {
      await request(tx).input("no", sql.VarChar(13), no).query(`DELETE FROM ${DETAIL} WHERE NoPO = @no`);
      await insertLines(tx, no, lines);
    }
    return { noPO: no };
  });
}

async function remove(no) {
  return inTransaction(async (tx) => {
    await lockPO(tx, no);
    const n = await countReceipts(tx, no);
    if (n > 0) {
      throw httpError(409, `PO ${no} sudah dipakai ${n} penerimaan. Gunakan Tutup PO.`);
    }
    for (const table of [DETAIL, HEADER]) {
      await request(tx).input("no", sql.VarChar(13), no).query(`DELETE FROM ${table} WHERE NoPO = @no`);
    }
    return { noPO: no };
  });
}

async function setClosed(no, closed, idUser) {
  return inTransaction(async (tx) => {
    const po = await lockPO(tx, no);
    if (Boolean(po.IsClosed) === closed) {
      throw httpError(409, closed ? "PO sudah ditutup" : "PO masih terbuka");
    }
    await request(tx)
      .input("no", sql.VarChar(13), no)
      .input("closed", sql.Bit, closed ? 1 : 0)
      .input("idUser", sql.Int, closed ? Number(idUser) || null : null).query(`
        UPDATE ${HEADER}
        SET IsClosed = @closed,
            TglClose = CASE WHEN @closed = 1 THEN GETDATE() ELSE NULL END,
            IdUserClose = @idUser
        WHERE NoPO = @no
      `);
    return { noPO: no };
  });
}

module.exports = {
  matches,
  computeRealisasi,
  assertPOUsable,
  getAll,
  getByNo,
  getOpenBySupplier,
  getMasters,
  create,
  update,
  remove,
  setClosed,
};
