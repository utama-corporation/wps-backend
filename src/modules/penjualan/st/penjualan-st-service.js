const { sql, poolPromise } = require("../../../core/config/db");
const { getKunciPeriode, assertPeriodeTerbuka } = require("../../../core/utils/periode-lock");

/* ============================================================
 * Paritas tablet: PenjualanStSnd.java + PenjualanApi.java +
 * TableConfigUtils.java + ProsesProduksiApi.find*ResultTable.
 * Prefix label → tabel detail penjualan + tabel header proses.
 * ==========================================================*/
const TIPE_CONFIG = {
  E: {
    tipe: "st",
    label: "SAWN TIMBER",
    list: "PenjualanST",
    col: "NoST",
    h: "ST_h",
    d: "ST_d",
    usedBy: [
      { table: "S4SProduksiInputST", col: "NoProduksi", nama: "Proses Produksi S4S" },
      { table: "AdjustmentInputST", col: "NoAdjustment", nama: "Adjustment ST" },
      { table: "BongkarSusunInputST", col: "NoBongkarSusun", nama: "Bongkar Susun" },
    ],
  },
  R: {
    tipe: "s4s",
    label: "S4S",
    list: "PenjualanS4S",
    col: "NoS4S",
    h: "S4S_h",
    d: "S4S_d",
    usedBy: [
      { table: "S4SProduksiInputS4S", col: "NoProduksi", nama: "Proses Produksi S4S" },
      { table: "FJProduksiInputS4S", col: "NoProduksi", nama: "Proses Produksi FJ" },
      { table: "MouldingProduksiInputS4S", col: "NoProduksi", nama: "Proses Produksi Moulding" },
      { table: "AdjustmentInputS4S", col: "NoAdjustment", nama: "Adjustment S4S" },
      { table: "BongkarSusunInputS4S", col: "NoBongkarSusun", nama: "Bongkar Susun" },
    ],
  },
  S: {
    tipe: "fj",
    label: "FINGER JOINT",
    list: "PenjualanFJ",
    col: "NoFJ",
    h: "FJ_h",
    d: "FJ_d",
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
    tipe: "moulding",
    label: "MOULDING",
    list: "PenjualanMoulding",
    col: "NoMoulding",
    h: "Moulding_h",
    d: "Moulding_d",
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
    tipe: "laminating",
    label: "LAMINATING",
    list: "PenjualanLaminating",
    col: "NoLaminating",
    h: "Laminating_h",
    d: "Laminating_d",
    usedBy: [
      { table: "CCAkhirProduksiInputLaminating", col: "NoProduksi", nama: "Proses Produksi CC Akhir" },
      { table: "MouldingProduksiInputLaminating", col: "NoProduksi", nama: "Proses Produksi Laminating" },
      { table: "AdjustmentInputLaminating", col: "NoAdjustment", nama: "Adjustment Laminating" },
      { table: "BongkarSusunInputLaminating", col: "NoBongkarSusun", nama: "Bongkar Susun Laminating" },
    ],
  },
  V: {
    tipe: "ccAkhir",
    label: "CROSS CUT",
    list: "PenjualanCCAkhir",
    col: "NoCCAkhir",
    h: "CCAkhir_h",
    d: "CCAkhir_d",
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
    tipe: "sanding",
    label: "SANDING",
    list: "PenjualanSanding",
    col: "NoSanding",
    h: "Sanding_h",
    d: "Sanding_d",
    usedBy: [
      { table: "LaminatingProduksiInputSanding", col: "NoProduksi", nama: "Proses Produksi Laminating" },
      { table: "PackingProduksiInputSanding", col: "NoProduksi", nama: "Proses Produksi Sanding" },
      { table: "AdjustmentInputSanding", col: "NoAdjustment", nama: "Adjustment Sanding" },
      { table: "BongkarSusunInputSanding", col: "NoBongkarSusun", nama: "Bongkar Susun Input Sanding" },
    ],
  },
};

const TIPE_URUT = ["st", "s4s", "fj", "moulding", "laminating", "ccAkhir", "sanding"];
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

/* ============================================================
 * GET ALL — list header (paritas PenjualanApi.getPenjualanData)
 * ==========================================================*/
async function getAll({ search, topRow }) {
  const pool = await poolPromise;
  const req = pool.request();
  const top = parseInt(topRow, 10) || 50;
  req.input("top", sql.Int, top);

  let where = "";
  if (search) {
    req.input("search", sql.VarChar(50), `%${search}%`);
    where = `WHERE A.NoJual LIKE @search OR A.NoSJ LIKE @search OR A.NoPlat LIKE @search
             OR B.Buyer LIKE @search OR A.Keterangan LIKE @search`;
  }

  const result = await req.query(`
    SELECT TOP (@top)
      A.NoJual,
      A.TglJual,
      A.NoSJ,
      B.Buyer,
      A.IdBuyer,
      C.Model AS JenisKendaraan,
      A.IdJenisKendaraan,
      A.Keterangan,
      A.NoPlat
    FROM Penjualan_h A
    LEFT JOIN MstBuyer B ON B.IdBuyer = A.IdBuyer
    LEFT JOIN MstJenisKendaraan C ON C.IdJenisKendaraan = A.IdJenisKendaraan
    ${where}
    ORDER BY A.NoJual DESC
  `);
  return result.recordset;
}

/* ============================================================
 * GET MASTERS — dropdown Buyer + Jenis Kendaraan
 * ==========================================================*/
async function getMasters() {
  const pool = await poolPromise;
  const buyers = await pool.request().query(`
    SELECT TOP 100 IdBuyer, Buyer, IsExport
    FROM dbo.MstBuyer
    ORDER BY Buyer ASC
  `);
  const kendaraan = await pool.request().query(`
    SELECT TOP 1000 IdJenisKendaraan, [Type], [Model], [Enable]
    FROM dbo.MstJenisKendaraan
    WHERE [Enable] = 1
    ORDER BY [Type] ASC, [Model] ASC
  `);
  return { buyers: buyers.recordset, kendaraan: kendaraan.recordset };
}

/* ============================================================
 * GET DETAIL — label per 7 tipe untuk satu NoJual
 * ==========================================================*/
async function getDetail(noJual) {
  const pool = await poolPromise;
  const out = {};
  for (const tipe of TIPE_URUT) {
    const cfg = cfgByTipe[tipe];
    const req = pool.request();
    req.input("noJual", sql.VarChar(50), noJual);
    const r = await req.query(`
      SELECT ${cfg.col} AS label FROM ${cfg.list} WHERE NoJual = @noJual ORDER BY ${cfg.col}
    `);
    out[tipe] = r.recordset.map((x) => x.label);
  }
  return out;
}

async function getHeaderRow(transaction, noJual) {
  const req = transaction ? transaction.request() : (await poolPromise).request();
  req.input("noJual", sql.VarChar(50), noJual);
  const r = await req.query(`SELECT NoJual, TglJual FROM Penjualan_h WHERE NoJual = @noJual`);
  return r.recordset[0] || null;
}

function validateHeader(data) {
  if (!(Number(data.idBuyer) > 0)) throw httpError(400, "Buyer wajib dipilih.");
  if (!(Number(data.idJenisKendaraan) > 0)) throw httpError(400, "Jenis Kendaraan wajib dipilih.");
  if (!data.tglJual) throw httpError(400, "Tanggal wajib diisi.");
}

const clip = (v, max) => {
  const s = v == null || v === "" ? null : String(v).trim();
  return s == null ? null : s.slice(0, max);
};

/* ============================================================
 * CREATE — generate G.XXXXXX + insert (paritas
 * insertPenjualanHeaderWithGeneratedNoJual: SERIALIZABLE + retry)
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
        SELECT ISNULL(MAX(TRY_CONVERT(INT, RIGHT(NoJual, 6))), 0) AS MaxNum
        FROM dbo.Penjualan_h WITH (UPDLOCK, HOLDLOCK)
        WHERE NoJual LIKE 'G.%' AND LEN(NoJual) = 8
      `);
      const next = Number(g.recordset[0].MaxNum) + 1;
      const noJual = "G." + String(next).padStart(6, "0");

      const req = new sql.Request(transaction);
      req.input("noJual", sql.VarChar(50), noJual);
      req.input("tglJual", sql.Date, data.tglJual);
      req.input("idBuyer", sql.Int, Number(data.idBuyer));
      req.input("keterangan", sql.VarChar(255), clip(data.keterangan, 255));
      req.input("noSJ", sql.VarChar(50), clip(data.noSJ, 50));
      req.input("noPlat", sql.VarChar(20), clip(data.noPlat, 20));
      req.input("idJenisKendaraan", sql.Int, Number(data.idJenisKendaraan));
      await req.query(`
        INSERT INTO dbo.Penjualan_h (NoJual, TglJual, IdBuyer, Keterangan, NoSJ, NoPlat, IdJenisKendaraan)
        VALUES (@noJual, @tglJual, @idBuyer, @keterangan, @noSJ, @noPlat, @idJenisKendaraan)
      `);

      const audit = new sql.Request(transaction);
      audit.input("nip", sql.VarChar(50), user || "admin");
      audit.input("aktifitas", sql.VarChar(500), `Membuat Data ${noJual} Pada Penjualan ST/WIP (Web)`);
      await audit.query(`INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas]) VALUES (@nip, GETDATE(), @aktifitas)`);

      await transaction.commit();
      return { noJual };
    } catch (err) {
      try { await transaction.rollback(); } catch { /* ignore */ }
      lastErr = err;
      // nomor duplikat (race) → coba ulang dengan angka baru
      if (!/PRIMARY KEY|UNIQUE|duplicate/i.test(err.message)) throw err;
    }
  }
  throw lastErr;
}

/* ============================================================
 * UPDATE — ubah header (paritas updatePenjualanHeader)
 * ==========================================================*/
async function updateHeader(noJual, data, user) {
  validateHeader(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const existing = await getHeaderRow(transaction, noJual);
    if (!existing) throw httpError(404, `Penjualan ${noJual} tidak ditemukan.`);

    const req = new sql.Request(transaction);
    req.input("noJual", sql.VarChar(50), noJual);
    req.input("tglJual", sql.Date, data.tglJual);
    req.input("idBuyer", sql.Int, Number(data.idBuyer));
    req.input("keterangan", sql.VarChar(255), clip(data.keterangan, 255));
    req.input("noSJ", sql.VarChar(50), clip(data.noSJ, 50));
    req.input("noPlat", sql.VarChar(20), clip(data.noPlat, 20));
    req.input("idJenisKendaraan", sql.Int, Number(data.idJenisKendaraan));
    await req.query(`
      UPDATE dbo.Penjualan_h
      SET TglJual = @tglJual, IdBuyer = @idBuyer, Keterangan = @keterangan,
          NoSJ = @noSJ, NoPlat = @noPlat, IdJenisKendaraan = @idJenisKendaraan
      WHERE NoJual = @noJual
    `);

    const audit = new sql.Request(transaction);
    audit.input("nip", sql.VarChar(50), user || "admin");
    audit.input("aktifitas", sql.VarChar(500), `Mengubah Data ${noJual} Pada Penjualan ST/WIP (Web)`);
    await audit.query(`INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas]) VALUES (@nip, GETDATE(), @aktifitas)`);

    await transaction.commit();
    return { noJual };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/* ============================================================
 * SCAN READY — cek sebelum kamera diaktifkan (paritas
 * setupCameraControlButton: pilih baris + tgl valid + isPeriodValid)
 * ==========================================================*/
async function scanReady(noJual) {
  const header = await getHeaderRow(null, noJual);
  if (!header) return { ready: false, message: "Pilih No. Penjualan Terlebih Dahulu!" };
  if (!header.TglJual) return { ready: false, message: "Tanggal Produksi tidak valid!" };
  const { kunci } = await getKunciPeriode(null, header.TglJual);
  if (kunci) return { ready: false, message: "Periode transaksi sudah ditutup!" };
  return { ready: true, message: "" };
}

/* ============================================================
 * LOOKUP — validasi label hasil scan (paritas alur
 * addScanResultToTable + handleValidData + handleDuplicateOrInvalidUsage)
 * ==========================================================*/
async function lookup(noJual, rawLabel) {
  const label = String(rawLabel || "").trim().toUpperCase();
  const cfg = configByLabel(label);
  if (!cfg) return { ok: false, message: `Label ${label || "-"} tidak sesuai` };

  const header = await getHeaderRow(null, noJual);
  if (!header) return { ok: false, message: "Pilih No. Penjualan Terlebih Dahulu!" };
  const tglJual = header.TglJual ? ymd(header.TglJual) : null;

  const pool = await poolPromise;

  const hReq = pool.request();
  hReq.input("label", sql.VarChar(50), label);
  const hRes = await hReq.query(`SELECT 1 FROM ${cfg.h} WHERE ${cfg.col} = @label`);
  const dReq = pool.request();
  dReq.input("label", sql.VarChar(50), label);
  const dRes = await dReq.query(`SELECT 1 FROM ${cfg.d} WHERE ${cfg.col} = @label`);
  if (hRes.recordset.length === 0 || dRes.recordset.length === 0) {
    return { ok: false, message: `Label ${label} Tidak ditemukan di Database` };
  }

  const uReq = pool.request();
  uReq.input("label", sql.VarChar(50), label);
  const uRes = await uReq.query(`SELECT DateUsage FROM ${cfg.h} WHERE ${cfg.col} = @label`);
  const dateUsage = uRes.recordset[0]?.DateUsage ?? null;

  if (dateUsage == null) {
    const cReq = pool.request();
    cReq.input("label", sql.VarChar(50), label);
    const cRes = await cReq.query(`SELECT DateCreate FROM ${cfg.h} WHERE ${cfg.col} = @label`);
    const dateCreate = cRes.recordset[0]?.DateCreate;
    if (dateCreate && tglJual && ymd(dateCreate) > tglJual) {
      return { ok: false, message: `Tgl Label lebih besar dari Tgl Produksi ${label}` };
    }
    return { ok: true, tipe: cfg.tipe, label };
  }

  // DateUsage terisi → cari label dipakai di mana
  const ownReq = pool.request();
  ownReq.input("noJual", sql.VarChar(50), noJual);
  ownReq.input("label", sql.VarChar(50), label);
  const ownRes = await ownReq.query(
    `SELECT 1 FROM ${cfg.list} WHERE NoJual = @noJual AND ${cfg.col} = @label`,
  );
  if (ownRes.recordset.length > 0) {
    return { ok: false, message: `Label ${label} Sudah di Masukkan ke dalam Tabel` };
  }

  for (const u of cfg.usedBy) {
    const r = pool.request();
    r.input("label", sql.VarChar(50), label);
    const res = await r.query(`SELECT TOP 1 ${u.col} FROM ${u.table} WHERE ${u.col} = @label`);
    if (res.recordset.length > 0) {
      return { ok: false, message: `Label ${label} sudah ada pada ${u.nama} : ${res.recordset[0][u.col]}` };
    }
  }

  const soldReq = pool.request();
  soldReq.input("label", sql.VarChar(50), label);
  const soldRes = await soldReq.query(
    `SELECT TOP 1 NoJual FROM ${cfg.list} WHERE ${cfg.col} = @label`,
  );
  if (soldRes.recordset.length > 0) {
    return { ok: false, message: `Label ${label} sudah terjual (No: ${soldRes.recordset[0].NoJual})` };
  }

  return { ok: false, message: `Label ${label} tidak ada di Proses manapun` };
}

/* ============================================================
 * SAVE — batch insert detail + UPDATE DateUsage (paritas
 * saveScannedResultsToDatabase: existing → toSave → save per tipe)
 * ==========================================================*/
async function saveDetail(noJual, body, user) {
  const header = await getHeaderRow(null, noJual);
  if (!header) throw httpError(404, `Penjualan ${noJual} tidak ditemukan.`);
  if (!header.TglJual) throw httpError(400, "Tanggal Produksi tidak valid!");
  await assertPeriodeTerbuka(header.TglJual);

  const tgl = ymd(header.TglJual);
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
    existingReq.input("noJual", sql.VarChar(50), noJual);
    const existingRes = await existingReq.query(
      `SELECT ${cfg.col} AS label FROM ${cfg.list} WHERE NoJual = @noJual`,
    );
    const existingSet = new Set(existingRes.recordset.map((x) => x.label));
    const toSave = labels.filter((x) => !existingSet.has(x));
    if (toSave.length === 0) continue;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      for (const label of toSave) {
        const ins = new sql.Request(transaction);
        ins.input("noJual", sql.VarChar(50), noJual);
        ins.input("label", sql.VarChar(50), label);
        await ins.query(
          `INSERT INTO ${cfg.list} (NoJual, ${cfg.col}) VALUES (@noJual, @label)`,
        );

        const upd = new sql.Request(transaction);
        upd.input("tgl", sql.Date, tgl);
        upd.input("label", sql.VarChar(50), label);
        await upd.query(`UPDATE ${cfg.h} SET DateUsage = @tgl WHERE ${cfg.col} = @label`);
      }

      const audit = new sql.Request(transaction);
      audit.input("nip", sql.VarChar(50), user || "admin");
      audit.input("aktifitas", sql.VarChar(500),
        `Menyimpan Detail ${noJual} Pada Penjualan ST/WIP (Web)`);
      await audit.query(`INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas]) VALUES (@nip, GETDATE(), @aktifitas)`);

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
 * DELETE LABEL — hapus 1 label dari detail + lepas DateUsage
 * (paritas long-press hapus — versi web memperbaiki bug tablet
 *  deleteDataByNoLabel yang tidak mengenali prefix G.)
 * ==========================================================*/
async function deleteLabel(noJual, rawLabel, user) {
  const label = String(rawLabel || "").trim().toUpperCase();
  const cfg = configByLabel(label);
  if (!cfg) throw httpError(400, `Label ${label || "-"} tidak sesuai`);

  const pool = await poolPromise;
  const check = pool.request();
  check.input("noJual", sql.VarChar(50), noJual);
  check.input("label", sql.VarChar(50), label);
  const checkRes = await check.query(
    `SELECT 1 FROM ${cfg.list} WHERE NoJual = @noJual AND ${cfg.col} = @label`,
  );
  if (checkRes.recordset.length === 0) {
    throw httpError(404, `Label ${label} tidak ada pada penjualan ${noJual}.`);
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const del = new sql.Request(transaction);
    del.input("noJual", sql.VarChar(50), noJual);
    del.input("label", sql.VarChar(50), label);
    await del.query(`DELETE FROM ${cfg.list} WHERE NoJual = @noJual AND ${cfg.col} = @label`);

    const upd = new sql.Request(transaction);
    upd.input("label", sql.VarChar(50), label);
    await upd.query(`UPDATE ${cfg.h} SET DateUsage = NULL WHERE ${cfg.col} = @label`);

    const audit = new sql.Request(transaction);
    audit.input("nip", sql.VarChar(50), user || "admin");
    audit.input("aktifitas", sql.VarChar(500),
      `Menghapus Label ${label} Dari Data ${noJual} Pada Penjualan ST/WIP (Web)`);
    await audit.query(`INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas]) VALUES (@nip, GETDATE(), @aktifitas)`);

    await transaction.commit();
    return { noJual, label };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/* ============================================================
 * LABEL INFO — paritas TooltipUtils/ProsesProduksiApi.getTooltipData
 * (info header label + baris ukuran + Total/M3/Ton; Ton khusus ST)
 * ==========================================================*/
const BULAN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(d) {
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, "0")} ${BULAN[x.getMonth()]} ${x.getFullYear()}`;
}
const fmtSpk = (no, buyer) => (no && buyer ? `${no} - ${buyer}` : "-");
const floor4 = (v) => Math.floor(v * 10000) / 10000;

async function getLabelInfo(rawLabel) {
  const label = String(rawLabel || "").trim().toUpperCase();
  const cfg = configByLabel(label);
  if (!cfg) throw httpError(400, `Label ${label || "-"} tidak sesuai`);

  const pool = await poolPromise;
  const hReq = pool.request();
  hReq.input("label", sql.VarChar(50), label);

  let header;
  if (cfg.tipe === "st") {
    const r = await hReq.query(`
      SELECT ST.${cfg.col} AS KeyColumn, ST.NoKayuBulat, KBH.Suket, ST.DateCreate,
             MJ.Jenis, ST.NoSPK, B.Buyer AS BuyerNoSPK, ST.IdUOMTblLebar, ST.IdUOMPanjang, KBH.NoPlat
      FROM ST_h ST
      LEFT JOIN KayuBulat_h KBH ON ST.NoKayuBulat = KBH.NoKayuBulat
      LEFT JOIN MstJenisKayu MJ ON ST.IdJenisKayu = MJ.IdJenisKayu
      LEFT JOIN MstSPK_h SPK ON ST.NoSPK = SPK.NoSPK
      LEFT JOIN MstBuyer B ON SPK.IdBuyer = B.IdBuyer
      WHERE ST.${cfg.col} = @label
    `);
    header = r.recordset[0] || null;
  } else {
    const r = await hReq.query(`
      SELECT h.${cfg.col} AS KeyColumn, h.DateCreate, h.Jam, k.Jenis, h.NoSPK,
             b1.Buyer AS BuyerNoSPK, h.NoSPKAsal, b2.Buyer AS BuyerNoSPKAsal,
             g.NamaGrade, h.IsLembur
      FROM ${cfg.h} h
      LEFT JOIN MstGrade g ON h.IdGrade = g.IdGrade
      LEFT JOIN MstJenisKayu k ON h.IdJenisKayu = k.IdJenisKayu
      LEFT JOIN MstSPK_h s1 ON h.NoSPK = s1.NoSPK
      LEFT JOIN MstBuyer b1 ON s1.IdBuyer = b1.IdBuyer
      LEFT JOIN MstSPK_h s2 ON h.NoSPKAsal = s2.NoSPK
      LEFT JOIN MstBuyer b2 ON s2.IdBuyer = b2.IdBuyer
      WHERE h.${cfg.col} = @label
    `);
    header = r.recordset[0] || null;
  }
  if (!header) throw httpError(404, `Label ${label} tidak ditemukan.`);

  const dReq = pool.request();
  dReq.input("label", sql.VarChar(50), label);
  const dRes = await dReq.query(
    `SELECT Tebal, Lebar, Panjang, JmlhBatang FROM ${cfg.d} WHERE ${cfg.col} = @label ORDER BY NoUrut`,
  );

  let totalPcs = 0;
  let totalM3 = 0;
  let totalTon = 0;
  const rows = dRes.recordset.map((x) => {
    const tebal = Number(x.Tebal) || 0;
    const lebar = Number(x.Lebar) || 0;
    const panjang = Number(x.Panjang) || 0;
    const pcs = Number(x.JmlhBatang) || 0;
    totalPcs += pcs;
    if (cfg.tipe === "st") {
      const raw = Number(header.IdUOMTblLebar) === 1
        ? ((tebal * lebar * panjang * pcs * 304.8) / 1e9 / 1.416)
        : ((tebal * lebar * panjang * pcs) / 7200.8);
      totalTon += floor4(raw);
      totalM3 += floor4(raw * 1.416);
    } else {
      totalM3 += floor4((tebal * lebar * panjang * pcs) / 1e9);
    }
    return { tebal, lebar, panjang, pcs };
  });

  const tgl = header.DateCreate ? fmtDate(header.DateCreate) : "-";
  const jam = header.Jam ? String(header.Jam) : "";
  const dateTime = jam ? `${tgl} (${jam})` : tgl;

  if (cfg.tipe === "st") {
    const noKb = header.NoKayuBulat;
    const suk = header.Suket;
    return {
      label,
      tipe: cfg.tipe,
      dateTime,
      jenis: header.Jenis ?? "-",
      spk: fmtSpk(header.NoSPK, header.BuyerNoSPK),
      spkAsal: "-",
      namaGrade: "-",
      isLembur: false,
      noPlat: header.NoPlat ?? "-",
      noKbSuket: noKb && suk ? `${noKb} - ${suk}` : "-",
      uomTbl: Number(header.IdUOMTblLebar) === 1 ? "mm" : '"',
      uomPjg: Number(header.IdUOMPanjang) === 4 ? "ft" : "-",
      rows,
      totalPcs,
      totalM3: floor4(totalM3),
      totalTon: floor4(totalTon),
    };
  }

  return {
    label,
    tipe: cfg.tipe,
    dateTime,
    jenis: header.Jenis ?? "-",
    spk: fmtSpk(header.NoSPK, header.BuyerNoSPK),
    spkAsal: fmtSpk(header.NoSPKAsal, header.BuyerNoSPKAsal),
    namaGrade: header.NamaGrade ?? "-",
    isLembur: !!header.IsLembur,
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
  getMasters,
  getDetail,
  createHeader,
  updateHeader,
  scanReady,
  lookup,
  saveDetail,
  deleteLabel,
  getLabelInfo,
};
