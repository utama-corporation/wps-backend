const { sql, poolPromise } = require("../../core/config/db");
const { getKunciPeriode, assertPeriodeTerbuka } = require("../../core/utils/periode-lock");
const penjualanStService = require("../penjualan/st/penjualan-st-service");

/* ============================================================
 * Paritas tablet: BongkarSusun.java + ProsesProduksiApi
 * (getBongkarSusunData / createNewBongkarSusun / updateBongkarSusunData /
 *  save*InBongkarSusun / deleteDataByNoLabel "Z" / getHistoryItems) +
 * TableConfigUtils. Prefix label → tabel input Bongkar Susun + tabel header proses.
 * ==========================================================*/
const TIPE_CONFIG = {
  E: {
    tipe: "st", label: "ST", input: "BongkarSusunInputST", col: "NoST", h: "ST_h", d: "ST_d",
    usedBy: [
      { table: "S4SProduksiInputST", col: "NoProduksi", nama: "Proses Produksi S4S" },
      { table: "AdjustmentInputST", col: "NoAdjustment", nama: "Adjustment ST" },
      { table: "BongkarSusunInputST", col: "NoBongkarSusun", nama: "Bongkar Susun" },
    ],
  },
  R: {
    tipe: "s4s", label: "S4S", input: "BongkarSusunInputS4S", col: "NoS4S", h: "S4S_h", d: "S4S_d",
    usedBy: [
      { table: "S4SProduksiInputS4S", col: "NoProduksi", nama: "Proses Produksi S4S" },
      { table: "FJProduksiInputS4S", col: "NoProduksi", nama: "Proses Produksi FJ" },
      { table: "MouldingProduksiInputS4S", col: "NoProduksi", nama: "Proses Produksi Moulding" },
      { table: "AdjustmentInputS4S", col: "NoAdjustment", nama: "Adjustment S4S" },
      { table: "BongkarSusunInputS4S", col: "NoBongkarSusun", nama: "Bongkar Susun" },
    ],
  },
  S: {
    tipe: "fj", label: "FJ", input: "BongkarSusunInputFJ", col: "NoFJ", h: "FJ_h", d: "FJ_d",
    usedBy: [
      { table: "SandingProduksiInputFJ", col: "NoProduksi", nama: "Proses Produksi Sanding" },
      { table: "S4SProduksiInputFJ", col: "NoProduksi", nama: "Proses Produksi S4S" },
      { table: "MouldingProduksiInputFJ", col: "NoProduksi", nama: "Proses Produksi Moulding" },
      { table: "CCAkhirProduksiInputFJ", col: "NoProduksi", nama: "Proses Produksi Cross Cut" },
      { table: "AdjustmentInputFJ", col: "NoAdjustment", nama: "Adjustment FJ" },
      { table: "BongkarSusunInputFJ", col: "NoBongkarSusun", nama: "Bongkar Susun FJ" },
    ],
  },
  T: {
    tipe: "moulding", label: "Moulding", input: "BongkarSusunInputMoulding", col: "NoMoulding", h: "Moulding_h", d: "Moulding_d",
    usedBy: [
      { table: "S4SProduksiInputMoulding", col: "NoProduksi", nama: "Proses Produksi S4S" },
      { table: "SandingProduksiInputMoulding", col: "NoProduksi", nama: "Proses Produksi Sanding" },
      { table: "PackingProduksiInputMoulding", col: "NoProduksi", nama: "Proses Packing" },
      { table: "MouldingProduksiInputMoulding", col: "NoProduksi", nama: "Proses Produksi Moulding" },
      { table: "LaminatingProduksiInputMoulding", col: "NoProduksi", nama: "Proses Produksi Laminating" },
      { table: "CCAkhirProduksiInputMoulding", col: "NoProduksi", nama: "Proses Produksi Cross Cut" },
      { table: "AdjustmentInputMoulding", col: "NoAdjustment", nama: "Adjustment Moulding" },
      { table: "BongkarSusunInputMoulding", col: "NoBongkarSusun", nama: "Bongkar Susun Moulding" },
    ],
  },
  U: {
    tipe: "laminating", label: "Laminating", input: "BongkarSusunInputLaminating", col: "NoLaminating", h: "Laminating_h", d: "Laminating_d",
    usedBy: [
      { table: "CCAkhirProduksiInputLaminating", col: "NoProduksi", nama: "Proses Produksi CC Akhir" },
      { table: "MouldingProduksiInputLaminating", col: "NoProduksi", nama: "Proses Produksi Laminating" },
      { table: "AdjustmentInputLaminating", col: "NoAdjustment", nama: "Adjustment Laminating" },
      { table: "BongkarSusunInputLaminating", col: "NoBongkarSusun", nama: "Bongkar Susun Laminating" },
    ],
  },
  V: {
    tipe: "ccAkhir", label: "CrossCut", input: "BongkarSusunInputCCAkhir", col: "NoCCAkhir", h: "CCAkhir_h", d: "CCAkhir_d",
    usedBy: [
      { table: "SandingProduksiInputCCAkhir", col: "NoProduksi", nama: "Proses Produksi Sanding" },
      { table: "S4SProduksiInputCCAkhir", col: "NoProduksi", nama: "Proses Produksi S4S" },
      { table: "MouldingProduksiInputCCAkhir", col: "NoProduksi", nama: "Proses Produksi Moulding" },
      { table: "LaminatingProduksiInputCCAkhir", col: "NoProduksi", nama: "Proses Produksi Laminating" },
      { table: "FJProduksiInputCCAkhir", col: "NoProduksi", nama: "Proses Produksi Finger Joint" },
      { table: "AdjustmentInputCCAkhir", col: "NoAdjustment", nama: "Adjustment Cross Cut" },
      { table: "BongkarSusunInputCCAkhir", col: "NoBongkarSusun", nama: "Bongkar Susun Cross Cut" },
    ],
  },
  W: {
    tipe: "sanding", label: "Sanding", input: "BongkarSusunInputSanding", col: "NoSanding", h: "Sanding_h", d: "Sanding_d",
    usedBy: [
      { table: "LaminatingProduksiInputSanding", col: "NoProduksi", nama: "Proses Produksi Laminating" },
      { table: "PackingProduksiInputSanding", col: "NoProduksi", nama: "Proses Produksi Sanding" },
      { table: "AdjustmentInputSanding", col: "NoAdjustment", nama: "Adjustment Sanding" },
      { table: "BongkarSusunInputSanding", col: "NoBongkarSusun", nama: "Bongkar Susun Input Sanding" },
    ],
  },
  I: {
    tipe: "packing", label: "Packing", input: "BongkarSusunInputBarangJadi", col: "NoBJ", h: "BarangJadi_h", d: "BarangJadi_d",
    usedBy: [
      { table: "CCAkhirProduksiInputBarangJadi", col: "NoProduksi", nama: "Proses Produksi Cross Cut" },
      { table: "PackingProduksiInputBarangJadi", col: "NoProduksi", nama: "Proses Packing" },
      { table: "LaminatingProduksiInputBarangJadi", col: "NoProduksi", nama: "Proses Produksi Laminating" },
      { table: "MouldingProduksiInputBarangJadi", col: "NoProduksi", nama: "Proses Produksi Moulding" },
      { table: "BongkarSusunInputBarangJadi", col: "NoBongkarSusun", nama: "Bongkar Susun" },
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

const ymd = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  const x = new Date(d);
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
};

const clip = (v, max) => {
  const s = v == null || v === "" ? null : String(v).trim();
  return s == null || s === "" ? null : s.slice(0, max);
};

async function audit(transaction, user, aktivitas) {
  const r = new sql.Request(transaction);
  r.input("nip", sql.VarChar(50), user || "admin");
  r.input("aktifitas", sql.VarChar(500), aktivitas);
  await r.query(`INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas]) VALUES (@nip, GETDATE(), @aktifitas)`);
}

/* ============================================================
 * GET ALL — list header (paritas getBongkarSusunData, TOP 50)
 * ==========================================================*/
async function getAll({ search, topRow }) {
  const pool = await poolPromise;
  const req = pool.request();
  const top = parseInt(topRow, 10) || 50;
  req.input("top", sql.Int, top);

  let where = "";
  if (search) {
    req.input("search", sql.VarChar(50), `%${search}%`);
    where = `WHERE NoBongkarSusun LIKE @search OR NoPenerimaanST LIKE @search OR Keterangan LIKE @search`;
  }

  const result = await req.query(`
    SELECT TOP (@top) NoBongkarSusun, Tanggal, IsPemakaian, NoPenerimaanST, Keterangan
    FROM BongkarSusun_h
    ${where}
    ORDER BY NoBongkarSusun DESC
  `);
  return result.recordset;
}

/* ============================================================
 * GET DETAIL — label per 8 tipe untuk satu NoBongkarSusun
 * ==========================================================*/
async function getDetail(noBongkarSusun) {
  const pool = await poolPromise;
  const out = {};
  for (const tipe of TIPE_URUT) {
    const cfg = cfgByTipe[tipe];
    const req = pool.request();
    req.input("no", sql.VarChar(50), noBongkarSusun);
    const r = await req.query(`
      SELECT ${cfg.col} AS label FROM ${cfg.input} WHERE NoBongkarSusun = @no ORDER BY ${cfg.col}
    `);
    out[tipe] = r.recordset.map((x) => x.label);
  }
  return out;
}

async function getHeaderRow(transaction, no) {
  const req = transaction ? transaction.request() : (await poolPromise).request();
  req.input("no", sql.VarChar(50), no);
  const r = await req.query(`SELECT NoBongkarSusun, Tanggal FROM BongkarSusun_h WHERE NoBongkarSusun = @no`);
  return r.recordset[0] || null;
}

function validateHeader(data) {
  if (!data.tanggal) throw httpError(400, "Tanggal harus diisi");
}

/* ============================================================
 * CREATE — generate Z.XXXXXX + insert (paritas createNewBongkarSusun)
 * ==========================================================*/
async function createHeader(data, user) {
  validateHeader(data);
  const pool = await poolPromise;

  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const g = await transaction.request().query(`
        SELECT ISNULL(MAX(TRY_CONVERT(INT, RIGHT(NoBongkarSusun, 6))), 0) AS MaxNum
        FROM dbo.BongkarSusun_h WITH (UPDLOCK, HOLDLOCK)
        WHERE NoBongkarSusun LIKE 'Z.%'
      `);
      const next = Number(g.recordset[0].MaxNum) + 1;
      const no = "Z." + String(next).padStart(6, "0");

      const req = new sql.Request(transaction);
      req.input("no", sql.VarChar(50), no);
      req.input("tanggal", sql.Date, data.tanggal);
      req.input("isPemakaian", sql.Bit, data.isPemakaian ? 1 : 0);
      req.input("noPenerimaanST", sql.VarChar(50), clip(data.noPenerimaanST, 50));
      req.input("keterangan", sql.VarChar(255), clip(data.keterangan, 255));
      await req.query(`
        INSERT INTO dbo.BongkarSusun_h (NoBongkarSusun, Tanggal, IsPemakaian, NoPenerimaanST, Keterangan)
        VALUES (@no, @tanggal, @isPemakaian, @noPenerimaanST, @keterangan)
      `);

      await audit(transaction, user, `Membuat Data ${no} Pada Bongkar Susun (Web)`);
      await transaction.commit();
      return { noBongkarSusun: no };
    } catch (err) {
      try { await transaction.rollback(); } catch { /* ignore */ }
      lastErr = err;
      if (!/PRIMARY KEY|UNIQUE|duplicate/i.test(err.message)) throw err;
    }
  }
  throw lastErr;
}

/* ============================================================
 * UPDATE — ubah header (paritas updateBongkarSusunData)
 * ==========================================================*/
async function updateHeader(no, data, user) {
  validateHeader(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const existing = await getHeaderRow(transaction, no);
    if (!existing) throw httpError(404, `Bongkar Susun ${no} tidak ditemukan.`);
    if (existing.Tanggal) await assertPeriodeTerbuka(existing.Tanggal);

    const req = new sql.Request(transaction);
    req.input("no", sql.VarChar(50), no);
    req.input("tanggal", sql.Date, data.tanggal);
    req.input("isPemakaian", sql.Bit, data.isPemakaian ? 1 : 0);
    req.input("noPenerimaanST", sql.VarChar(50), clip(data.noPenerimaanST, 50));
    req.input("keterangan", sql.VarChar(255), clip(data.keterangan, 255));
    await req.query(`
      UPDATE dbo.BongkarSusun_h
      SET Tanggal = @tanggal, IsPemakaian = @isPemakaian, NoPenerimaanST = @noPenerimaanST, Keterangan = @keterangan
      WHERE NoBongkarSusun = @no
    `);

    await audit(transaction, user, `Mengubah Data ${no} Pada Bongkar Susun (Web)`);
    await transaction.commit();
    return { noBongkarSusun: no };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/* ============================================================
 * SCAN READY — cek sebelum scan (baris dipilih + tgl valid + periode terbuka)
 * ==========================================================*/
async function scanReady(no) {
  const header = await getHeaderRow(null, no);
  if (!header) return { ready: false, message: "Pilih NoBongkarSusun Terlebih Dahulu!" };
  if (!header.Tanggal) return { ready: false, message: "Tanggal Produksi tidak valid!" };
  const { kunci } = await getKunciPeriode(null, header.Tanggal);
  if (kunci) return { ready: false, message: "Periode transaksi sudah ditutup!" };
  return { ready: true, message: "" };
}

/* ============================================================
 * LOOKUP — validasi label hasil scan (paritas addScanResultToTable +
 * handleValidData + handleDuplicateOrInvalidUsage)
 * ==========================================================*/
async function lookup(no, rawLabel) {
  const label = String(rawLabel || "").trim().toUpperCase();
  const cfg = configByLabel(label);
  if (!cfg) return { ok: false, message: `Label ${label || "-"} tidak sesuai` };

  const header = await getHeaderRow(null, no);
  if (!header) return { ok: false, message: "Pilih NoBongkarSusun Terlebih Dahulu!" };
  const tgl = header.Tanggal ? ymd(header.Tanggal) : null;

  const pool = await poolPromise;
  const q = async (text) => {
    const r = pool.request();
    r.input("label", sql.VarChar(50), label);
    r.input("no", sql.VarChar(50), no);
    return (await r.query(text)).recordset;
  };

  const inH = await q(`SELECT 1 AS x FROM ${cfg.h} WHERE ${cfg.col} = @label`);
  const inD = await q(`SELECT 1 AS x FROM ${cfg.d} WHERE ${cfg.col} = @label`);
  if (inH.length === 0 || inD.length === 0) {
    return { ok: false, message: `Label ${label} Tidak ditemukan di Database` };
  }

  const usage = await q(`SELECT DateUsage, DateCreate FROM ${cfg.h} WHERE ${cfg.col} = @label`);
  const dateUsage = usage[0]?.DateUsage ?? null;

  if (dateUsage == null) {
    const dateCreate = usage[0]?.DateCreate;
    // isDateValidInBongkarSusun: Tanggal bongkar susun harus >= tanggal label dibuat
    if (dateCreate && tgl && ymd(dateCreate) > tgl) {
      return { ok: false, message: `Tgl Label lebih besar dari Tgl Produksi ${label}` };
    }
    return { ok: true, tipe: cfg.tipe, label };
  }

  const own = await q(`SELECT 1 AS x FROM ${cfg.input} WHERE NoBongkarSusun = @no AND ${cfg.col} = @label`);
  if (own.length > 0) {
    return { ok: false, message: `Label ${label} Sudah di Masukkan ke dalam Tabel` };
  }

  for (const u of cfg.usedBy) {
    const res = await q(`SELECT TOP 1 ${u.col} AS v FROM ${u.table} WHERE ${cfg.col} = @label`);
    if (res.length > 0) {
      return { ok: false, message: `Label ${label} sudah ada pada ${u.nama} : ${res[0].v}` };
    }
  }

  return { ok: false, message: `Label ${label} tidak ada di Proses manapun` };
}

/* ============================================================
 * SAVE — batch insert ke BongkarSusunInputX + UPDATE DateUsage
 * (paritas saveScannedResultsToDatabase: existing → toSave → save per tipe)
 * ==========================================================*/
async function saveDetail(no, body, user) {
  const header = await getHeaderRow(null, no);
  if (!header) throw httpError(404, `Bongkar Susun ${no} tidak ditemukan.`);
  if (!header.Tanggal) throw httpError(400, "Tanggal Produksi tidak valid!");
  await assertPeriodeTerbuka(header.Tanggal);

  const tgl = ymd(header.Tanggal);
  const pool = await poolPromise;
  const saved = {};
  let total = 0;

  for (const tipe of TIPE_URUT) {
    saved[tipe] = 0;
    const staged = Array.isArray(body?.[tipe]) ? body[tipe] : [];
    if (staged.length === 0) continue;
    const cfg = cfgByTipe[tipe];

    const labels = [];
    for (const s of staged) {
      const v = String(s || "").trim().toUpperCase();
      if (v && !labels.includes(v)) labels.push(v);
    }
    if (labels.length === 0) continue;

    const existingReq = pool.request();
    existingReq.input("no", sql.VarChar(50), no);
    const existingRes = await existingReq.query(
      `SELECT ${cfg.col} AS label FROM ${cfg.input} WHERE NoBongkarSusun = @no`,
    );
    const existingSet = new Set(existingRes.recordset.map((x) => x.label));
    const toSave = labels.filter((x) => !existingSet.has(x));
    if (toSave.length === 0) continue;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      for (const label of toSave) {
        const ins = new sql.Request(transaction);
        ins.input("no", sql.VarChar(50), no);
        ins.input("label", sql.VarChar(50), label);
        await ins.query(
          `INSERT INTO ${cfg.input} (NoBongkarSusun, ${cfg.col}, DateTimeSaved) VALUES (@no, @label, GETDATE())`,
        );

        const upd = new sql.Request(transaction);
        upd.input("tgl", sql.Date, tgl);
        upd.input("label", sql.VarChar(50), label);
        await upd.query(`UPDATE ${cfg.h} SET DateUsage = @tgl WHERE ${cfg.col} = @label`);
      }

      await audit(transaction, user, `Mengubah Data ${no} Pada Bongkar Susun (Web)`);
      await transaction.commit();
      saved[tipe] = toSave.length;
      total += toSave.length;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  return { saved, total, message: total === 0 ? "Tidak ada data baru untuk disimpan." : "Berhasil menyimpan data" };
}

/* ============================================================
 * DELETE LABEL — hapus 1 label + lepas DateUsage
 * (paritas deleteDataByNoLabel untuk prefix "Z")
 * ==========================================================*/
async function deleteLabel(no, rawLabel, user) {
  const label = String(rawLabel || "").trim().toUpperCase();
  const cfg = configByLabel(label);
  if (!cfg) throw httpError(400, `Label ${label || "-"} tidak sesuai`);

  const header = await getHeaderRow(null, no);
  if (!header) throw httpError(404, `Bongkar Susun ${no} tidak ditemukan.`);
  if (header.Tanggal) await assertPeriodeTerbuka(header.Tanggal);

  const pool = await poolPromise;
  const check = pool.request();
  check.input("no", sql.VarChar(50), no);
  check.input("label", sql.VarChar(50), label);
  const checkRes = await check.query(
    `SELECT 1 AS x FROM ${cfg.input} WHERE NoBongkarSusun = @no AND ${cfg.col} = @label`,
  );
  if (checkRes.recordset.length === 0) {
    throw httpError(404, `Label ${label} tidak ada pada Bongkar Susun ${no}.`);
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const del = new sql.Request(transaction);
    del.input("no", sql.VarChar(50), no);
    del.input("label", sql.VarChar(50), label);
    await del.query(`DELETE FROM ${cfg.input} WHERE NoBongkarSusun = @no AND ${cfg.col} = @label`);

    const upd = new sql.Request(transaction);
    upd.input("label", sql.VarChar(50), label);
    await upd.query(`UPDATE ${cfg.h} SET DateUsage = NULL WHERE ${cfg.col} = @label`);

    await audit(transaction, user, `Menghapus Label ${label} Dari Data ${no} Pada Bongkar Susun (Web)`);
    await transaction.commit();
    return { noBongkarSusun: no, label };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/* ============================================================
 * HISTORY — paritas showHistoryDialog / getHistoryItems:
 * jumlah label per waktu simpan, per tipe.
 * ==========================================================*/
async function getHistory(no) {
  const pool = await poolPromise;
  const union = TIPE_URUT.map((t) => {
    const c = cfgByTipe[t];
    return `SELECT '${c.label}' AS Label, ${c.col} AS KodeLabel, DateTimeSaved FROM ${c.input} WHERE NoBongkarSusun = @no`;
  }).join(" UNION ALL ");

  const req = pool.request();
  req.input("no", sql.VarChar(50), no);
  const r = await req.query(`
    SELECT DateTimeSaved, Label, COUNT(KodeLabel) AS Total
    FROM (${union}) AS CombinedData
    GROUP BY DateTimeSaved, Label
    ORDER BY DateTimeSaved DESC
  `);

  const groups = new Map();
  for (const row of r.recordset) {
    const key = row.DateTimeSaved ? new Date(row.DateTimeSaved).toISOString() : "-";
    if (!groups.has(key)) groups.set(key, { dateTimeSaved: row.DateTimeSaved, items: [], total: 0 });
    const g = groups.get(key);
    g.items.push({ label: row.Label, total: Number(row.Total) });
    g.total += Number(row.Total);
  }
  return Array.from(groups.values());
}

/* ============================================================
 * LABEL INFO — 7 tipe awal didelegasikan ke Penjualan ST; Packing (BJ) di sini.
 * ==========================================================*/
const BULAN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const floor4 = (v) => Math.floor(v * 10000) / 10000;

async function getLabelInfo(rawLabel) {
  const label = String(rawLabel || "").trim().toUpperCase();
  const cfg = configByLabel(label);
  if (!cfg) throw httpError(400, `Label ${label || "-"} tidak sesuai`);
  if (cfg.tipe !== "packing") return penjualanStService.getLabelInfo(label);

  const pool = await poolPromise;
  const hReq = pool.request();
  hReq.input("label", sql.VarChar(50), label);
  const h = await hReq.query(`
    SELECT h.NoBJ AS KeyColumn, h.DateCreate, h.Jam, k.Jenis, g.NamaBarangJadi, h.NoSPK, b.Buyer
    FROM BarangJadi_h h
    LEFT JOIN MstJenisKayu k ON k.IdJenisKayu = h.IdJenisKayu
    LEFT JOIN MstBarangJadi g ON g.IdBarangJadi = h.IdBarangJadi
    LEFT JOIN MstSPK_h sp ON sp.NoSPK = h.NoSPK
    LEFT JOIN MstBuyer b ON b.IdBuyer = sp.IdBuyer
    WHERE h.NoBJ = @label
  `);
  const header = h.recordset[0];
  if (!header) throw httpError(404, `Label ${label} tidak ditemukan.`);

  const dReq = pool.request();
  dReq.input("label", sql.VarChar(50), label);
  const d = await dReq.query(
    `SELECT Tebal, Lebar, Panjang, JmlhBatang FROM BarangJadi_d WHERE NoBJ = @label ORDER BY NoUrut`,
  );

  let totalPcs = 0;
  let totalM3 = 0;
  const rows = d.recordset.map((x) => {
    const tebal = Number(x.Tebal) || 0;
    const lebar = Number(x.Lebar) || 0;
    const panjang = Number(x.Panjang) || 0;
    const pcs = Number(x.JmlhBatang) || 0;
    totalPcs += pcs;
    totalM3 += floor4((tebal * lebar * panjang * pcs) / 1e9);
    return { tebal, lebar, panjang, pcs };
  });

  const t = header.DateCreate ? new Date(header.DateCreate) : null;
  const tgl = t ? `${String(t.getDate()).padStart(2, "0")} ${BULAN[t.getMonth()]} ${t.getFullYear()}` : "-";
  const jam = header.Jam ? String(header.Jam) : "";

  return {
    label,
    tipe: "packing",
    dateTime: jam ? `${tgl} (${jam})` : tgl,
    jenis: [header.Jenis, header.NamaBarangJadi].filter(Boolean).join(" · ") || "-",
    spk: header.NoSPK && header.Buyer ? `${header.NoSPK} - ${header.Buyer}` : "-",
    spkAsal: "-",
    namaGrade: "-",
    isLembur: false,
    noPlat: "-",
    noKbSuket: "-",
    uomTbl: "mm",
    uomPjg: "-",
    rows,
    totalPcs,
    totalM3: floor4(totalM3),
    totalTon: 0,
  };
}

module.exports = {
  getAll,
  getDetail,
  createHeader,
  updateHeader,
  scanReady,
  lookup,
  saveDetail,
  deleteLabel,
  getHistory,
  getLabelInfo,
};
