const { sql, poolPromise } = require("../../core/config/db");
const { getKunciPeriode } = require("../../core/utils/periode-lock");
const bongkarSusunService = require("../bongkar-susun/bongkar-susun-service");

/* ============================================================
 * Paritas tablet: Nyangkut.java + NyangkutApi
 * (getNyangkutData / createNewNyangkut / updateNyangkut / deleteNyangkutHeader /
 *  getNoXByNoNyangkut / deleteNyangkutX) dan aturan scan label dari
 *  POST /label-nyangkut/:nonyangkut (nyangkut-routes.js).
 * Header Nyangkut_h (GC.XXXXXX) + 8 tabel detail Nyangkut_X.
 * ==========================================================*/
const TIPE_CONFIG = {
  E: {
    tipe: "st", table: "Nyangkut_ST", col: "NoST", h: "ST_h",
    usedBy: [
      { table: "S4SProduksiInputST", col: "NoProduksi" },
      { table: "AdjustmentInputST", col: "NoAdjustment" },
      { table: "BongkarSusunInputST", col: "NoBongkarSusun" },
    ],
  },
  R: {
    tipe: "s4s", table: "Nyangkut_S4S", col: "NoS4S", h: "S4S_h",
    usedBy: [
      { table: "S4SProduksiInputS4S", col: "NoProduksi" },
      { table: "FJProduksiInputS4S", col: "NoProduksi" },
      { table: "MouldingProduksiInputS4S", col: "NoProduksi" },
      { table: "AdjustmentInputS4S", col: "NoAdjustment" },
      { table: "BongkarSusunInputS4S", col: "NoBongkarSusun" },
    ],
  },
  S: {
    tipe: "fj", table: "Nyangkut_FJ", col: "NoFJ", h: "FJ_h",
    usedBy: [
      { table: "SandingProduksiInputFJ", col: "NoProduksi" },
      { table: "S4SProduksiInputFJ", col: "NoProduksi" },
      { table: "MouldingProduksiInputFJ", col: "NoProduksi" },
      { table: "CCAkhirProduksiInputFJ", col: "NoProduksi" },
      { table: "AdjustmentInputFJ", col: "NoAdjustment" },
      { table: "BongkarSusunInputFJ", col: "NoBongkarSusun" },
    ],
  },
  T: {
    tipe: "moulding", table: "Nyangkut_Moulding", col: "NoMoulding", h: "Moulding_h",
    usedBy: [
      { table: "S4SProduksiInputMoulding", col: "NoProduksi" },
      { table: "SandingProduksiInputMoulding", col: "NoProduksi" },
      { table: "PackingProduksiInputMoulding", col: "NoProduksi" },
      { table: "MouldingProduksiInputMoulding", col: "NoProduksi" },
      { table: "LaminatingProduksiInputMoulding", col: "NoProduksi" },
      { table: "CCAkhirProduksiInputMoulding", col: "NoProduksi" },
      { table: "AdjustmentInputMoulding", col: "NoAdjustment" },
      { table: "BongkarSusunInputMoulding", col: "NoBongkarSusun" },
    ],
  },
  U: {
    tipe: "laminating", table: "Nyangkut_Laminating", col: "NoLaminating", h: "Laminating_h",
    usedBy: [
      { table: "MouldingProduksiInputLaminating", col: "NoProduksi" },
      { table: "CCAkhirProduksiInputLaminating", col: "NoProduksi" },
      { table: "AdjustmentInputLaminating", col: "NoAdjustment" },
      { table: "BongkarSusunInputLaminating", col: "NoBongkarSusun" },
    ],
  },
  V: {
    tipe: "ccAkhir", table: "Nyangkut_CCA", col: "NoCCAkhir", h: "CCAkhir_h",
    usedBy: [
      { table: "S4SProduksiInputCCAkhir", col: "NoProduksi" },
      { table: "FJProduksiInputCCAkhir", col: "NoProduksi" },
      { table: "MouldingProduksiInputCCAkhir", col: "NoProduksi" },
      { table: "LaminatingProduksiInputCCAkhir", col: "NoProduksi" },
      { table: "SandingProduksiInputCCAkhir", col: "NoProduksi" },
      { table: "AdjustmentInputCCAkhir", col: "NoAdjustment" },
      { table: "BongkarSusunInputCCAkhir", col: "NoBongkarSusun" },
    ],
  },
  W: {
    tipe: "sanding", table: "Nyangkut_Sanding", col: "NoSanding", h: "Sanding_h",
    usedBy: [
      { table: "LaminatingProduksiInputSanding", col: "NoProduksi" },
      { table: "PackingProduksiInputSanding", col: "NoProduksi" },
      { table: "AdjustmentInputSanding", col: "NoAdjustment" },
      { table: "BongkarSusunInputSanding", col: "NoBongkarSusun" },
    ],
  },
  I: {
    tipe: "packing", table: "Nyangkut_BarangJadi", col: "NoBJ", h: "BarangJadi_h",
    usedBy: [
      { table: "MouldingProduksiInputBarangJadi", col: "NoProduksi" },
      { table: "LaminatingProduksiInputBarangJadi", col: "NoProduksi" },
      { table: "CCAkhirProduksiInputBarangJadi", col: "NoProduksi" },
      { table: "PackingProduksiInputBarangJadi", col: "NoProduksi" },
      { table: "BongkarSusunInputBarangJadi", col: "NoBongkarSusun" },
    ],
  },
};

const TIPE_URUT = ["st", "s4s", "fj", "moulding", "laminating", "ccAkhir", "sanding", "packing"];
const cfgByTipe = {};
for (const cfg of Object.values(TIPE_CONFIG)) cfgByTipe[cfg.tipe] = cfg;

function configByLabel(label) {
  if (!label || label.length < 2) return null;
  return TIPE_CONFIG[label.charAt(0).toUpperCase()] || null;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function audit(transaction, user, aktivitas) {
  const r = new sql.Request(transaction);
  r.input("nip", sql.VarChar(50), user || "admin");
  r.input("aktifitas", sql.VarChar(500), aktivitas);
  await r.query(`INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas]) VALUES (@nip, GETDATE(), @aktifitas)`);
}

const fmtTgl = (d) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

/* ============================================================
 * GET ALL — list header (paritas getNyangkutData, TOP 50)
 * ==========================================================*/
async function getAll({ search, topRow }) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("top", sql.Int, parseInt(topRow, 10) || 50);

  let where = "";
  if (search) {
    req.input("search", sql.VarChar(50), `%${search}%`);
    where = `WHERE NoNyangkut LIKE @search`;
  }

  const r = await req.query(`
    SELECT TOP (@top) NoNyangkut, Tgl FROM dbo.Nyangkut_h ${where} ORDER BY NoNyangkut DESC
  `);
  return r.recordset;
}

/* ============================================================
 * GET DETAIL — label per 8 tipe untuk satu NoNyangkut
 * ==========================================================*/
async function getDetail(no) {
  const pool = await poolPromise;
  const out = {};
  for (const tipe of TIPE_URUT) {
    const cfg = cfgByTipe[tipe];
    const req = pool.request();
    req.input("no", sql.VarChar(50), no);
    const r = await req.query(`SELECT ${cfg.col} AS label FROM ${cfg.table} WHERE NoNyangkut = @no`);
    out[tipe] = r.recordset.map((x) => x.label);
  }
  return out;
}

async function getHeaderRow(transaction, no) {
  const req = transaction ? transaction.request() : (await poolPromise).request();
  req.input("no", sql.VarChar(50), no);
  const r = await req.query(`SELECT NoNyangkut, Tgl FROM dbo.Nyangkut_h WHERE NoNyangkut = @no`);
  return r.recordset[0] || null;
}

function validateHeader(data) {
  if (!data.tanggal) throw httpError(400, "Tanggal harus diisi");
}

/* CREATE — generate GC.XXXXXX (paritas createNewNyangkut) */
async function createHeader(data, user) {
  validateHeader(data);
  const pool = await poolPromise;

  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const g = await transaction.request().query(`
        SELECT ISNULL(MAX(TRY_CONVERT(INT, RIGHT(NoNyangkut, 6))), 0) AS MaxNum
        FROM dbo.Nyangkut_h WITH (UPDLOCK, HOLDLOCK)
        WHERE NoNyangkut LIKE 'GC.%'
      `);
      const no = "GC." + String(Number(g.recordset[0].MaxNum) + 1).padStart(6, "0");

      const req = new sql.Request(transaction);
      req.input("no", sql.VarChar(50), no);
      req.input("tgl", sql.Date, data.tanggal);
      await req.query(`INSERT INTO dbo.Nyangkut_h (NoNyangkut, Tgl) VALUES (@no, @tgl)`);

      await audit(transaction, user, `Membuat Data ${no} Pada Nyangkut (Web)`);
      await transaction.commit();
      return { noNyangkut: no };
    } catch (err) {
      try { await transaction.rollback(); } catch { /* ignore */ }
      lastErr = err;
      if (!/PRIMARY KEY|UNIQUE|duplicate/i.test(err.message)) throw err;
    }
  }
  throw lastErr;
}

/* UPDATE — paritas updateNyangkut (hanya tanggal) */
async function updateHeader(no, data, user) {
  validateHeader(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const req = new sql.Request(transaction);
    req.input("no", sql.VarChar(50), no);
    req.input("tgl", sql.Date, data.tanggal);
    const r = await req.query(`UPDATE dbo.Nyangkut_h SET Tgl = @tgl WHERE NoNyangkut = @no`);
    if (!r.rowsAffected[0]) throw httpError(404, `Nyangkut ${no} tidak ditemukan.`);

    await audit(transaction, user, `Mengubah Data ${no} Pada Nyangkut (Web)`);
    await transaction.commit();
    return { noNyangkut: no };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

/* DELETE header + 8 tabel detail — paritas deleteNyangkutHeader */
async function deleteHeader(no, user) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    for (const cfg of Object.values(TIPE_CONFIG)) {
      const d = new sql.Request(transaction);
      d.input("no", sql.VarChar(50), no);
      await d.query(`DELETE FROM ${cfg.table} WHERE NoNyangkut = @no`);
    }
    const h = new sql.Request(transaction);
    h.input("no", sql.VarChar(50), no);
    const r = await h.query(`DELETE FROM dbo.Nyangkut_h WHERE NoNyangkut = @no`);
    if (!r.rowsAffected[0]) throw httpError(404, `Nyangkut ${no} tidak ditemukan.`);

    await audit(transaction, user, `Menghapus Data ${no} Pada Nyangkut (Web)`);
    await transaction.commit();
    return { noNyangkut: no };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

/* SCAN READY — tanggal valid + periode terbuka (paritas pengecekan sebelum kamera aktif) */
async function scanReady(no) {
  const header = await getHeaderRow(null, no);
  if (!header) return { ready: false, message: "Pilih NoNyangkut Terlebih Dahulu!" };
  if (!header.Tgl) return { ready: false, message: "Tanggal Produksi tidak valid!" };
  const { kunci } = await getKunciPeriode(null, header.Tgl);
  if (kunci) return { ready: false, message: "Periode transaksi sudah ditutup!" };
  return { ready: true, message: "" };
}

/**
 * Validasi satu label untuk Nyangkut `no` (aturan POST /label-nyangkut/:nonyangkut):
 * label ada, belum dilancarkan, tidak sedang diproses di tempat lain, tidak duplikat.
 * `runner` = pool atau transaction (punya .request()).
 */
async function checkLabel(runner, no, label, cfg) {
  const q = async (text) => {
    const r = runner.request();
    r.input("label", sql.VarChar(50), label);
    r.input("no", sql.VarChar(50), no);
    return (await r.query(text)).recordset;
  };

  const hdr = await q(`SELECT DateUsage FROM ${cfg.h} WHERE ${cfg.col} = @label`);
  if (hdr.length === 0) return { ok: false, message: `Label ${label} Tidak ditemukan di Database` };

  const lancar = await q(`SELECT TOP 1 DateLancar FROM ${cfg.table} WHERE ${cfg.col} = @label AND DateLancar IS NOT NULL`);
  if (lancar.length > 0) {
    return { ok: false, message: `Label ini sudah dilancarkan pada ${fmtTgl(lancar[0].DateLancar)}!` };
  }

  if (hdr[0].DateUsage != null) {
    for (const u of cfg.usedBy) {
      const used = await q(`SELECT TOP 1 ${u.col} AS v FROM ${u.table} WHERE ${cfg.col} = @label`);
      if (used.length > 0) return { ok: false, message: `Label sudah di Proses pada Nomor ${used[0].v}!` };
    }
  }

  const dup = await q(`SELECT COUNT(*) AS n FROM ${cfg.table} WHERE ${cfg.col} = @label AND NoNyangkut = @no`);
  if (dup[0].n > 0) return { ok: false, message: "Data duplikat!" };

  return { ok: true };
}

/* LOOKUP — validasi label hasil scan sebelum masuk daftar sementara */
async function lookup(no, rawLabel) {
  const label = String(rawLabel || "").trim().toUpperCase();
  const cfg = configByLabel(label);
  if (!cfg) return { ok: false, message: `Label ${label || "-"} tidak sesuai` };
  if (!(await getHeaderRow(null, no))) return { ok: false, message: "Pilih NoNyangkut Terlebih Dahulu!" };

  const pool = await poolPromise;
  const r = await checkLabel(pool, no, label, cfg);
  return r.ok ? { ok: true, tipe: cfg.tipe, label } : r;
}

/* SAVE — simpan batch label {tipe: [label]} ke Nyangkut_X dalam satu transaksi */
async function saveDetail(no, body, user) {
  const header = await getHeaderRow(null, no);
  if (!header) throw httpError(404, `Nyangkut ${no} tidak ditemukan.`);
  if (header.Tgl) {
    const { kunci } = await getKunciPeriode(null, header.Tgl);
    if (kunci) throw httpError(400, "Periode transaksi sudah ditutup!");
  }

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    let total = 0;
    for (const tipe of TIPE_URUT) {
      const cfg = cfgByTipe[tipe];
      const labels = [...new Set((body[tipe] || []).map((x) => String(x).trim().toUpperCase()).filter(Boolean))];
      for (const label of labels) {
        if (configByLabel(label) !== cfg) throw httpError(400, `Label ${label} tidak sesuai`);
        const c = await checkLabel(transaction, no, label, cfg);
        if (!c.ok) throw httpError(409, `${label}: ${c.message}`);

        const req = new sql.Request(transaction);
        req.input("no", sql.VarChar(50), no);
        req.input("label", sql.VarChar(50), label);
        await req.query(`INSERT INTO ${cfg.table} (NoNyangkut, ${cfg.col}, DateLancar) VALUES (@no, @label, NULL)`);
        total++;
      }
    }
    if (total === 0) throw httpError(400, "Tidak ada label untuk disimpan");

    await audit(transaction, user, `Mengubah Data ${no} Pada Nyangkut (Web)`);
    await transaction.commit();
    return { total, message: `Berhasil menyimpan ${total} label` };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

/* DELETE satu label dari Nyangkut — paritas deleteNyangkutX */
async function deleteLabel(no, rawLabel, user) {
  const label = String(rawLabel || "").trim().toUpperCase();
  const cfg = configByLabel(label);
  if (!cfg) throw httpError(400, `Label ${label || "-"} tidak sesuai`);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const req = new sql.Request(transaction);
    req.input("no", sql.VarChar(50), no);
    req.input("label", sql.VarChar(50), label);
    const r = await req.query(`DELETE FROM ${cfg.table} WHERE NoNyangkut = @no AND ${cfg.col} = @label`);
    if (!r.rowsAffected[0]) throw httpError(404, `Label ${label} tidak ada pada ${no}.`);

    await audit(transaction, user, `Mengeluarkan Label ${label} dari ${no} Pada Nyangkut (Web)`);
    await transaction.commit();
    return { noNyangkut: no, label };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

module.exports = {
  getAll,
  getDetail,
  createHeader,
  updateHeader,
  deleteHeader,
  scanReady,
  lookup,
  saveDetail,
  deleteLabel,
  getLabelInfo: bongkarSusunService.getLabelInfo,
};
