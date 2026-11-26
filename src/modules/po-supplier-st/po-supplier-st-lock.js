/**
 * Kunci PO untuk Label ST: label pada penerimaan yang terhubung ke PO hanya boleh
 * memakai jenis kayu + tebal + lebar + panjang yang ada di baris PO.
 * - Pcs boleh melebihi PO (peringatan hanya di UI).
 * - Saat edit, ukuran yang SUDAH dimiliki label boleh dipertahankan (mis. PO ditautkan belakangan).
 */
const { sql, poolPromise } = require("../../core/config/db");
const service = require("./po-supplier-st-service");

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

async function findReceiptOfLabel(noST) {
  const pool = await poolPromise;
  const r = await pool
    .request()
    .input("noST", sql.VarChar(13), noST)
    .query("SELECT TOP 1 NoPenerimaanST FROM PenerimaanSTPembelian_d WHERE NoST = @noST");
  return r.recordset[0]?.NoPenerimaanST ?? null;
}

async function findPOOfReceipt(noPenerimaan) {
  const pool = await poolPromise;
  const r = await pool
    .request()
    .input("no", sql.VarChar(13), noPenerimaan)
    .query("SELECT NoPO FROM PenerimaanSTPembelian_h WHERE NoPenerimaanST = @no");
  return r.recordset[0]?.NoPO ?? null;
}

/** Rincian ukuran label yang tersimpan sekarang. */
async function getLabelItems(noST) {
  const pool = await poolPromise;
  const r = await pool.request().input("noST", sql.VarChar(13), noST).query(`
    SELECT h.IdJenisKayu, k.Jenis AS JenisKayu, h.IdUOMTblLebar, d.Tebal, d.Lebar, d.Panjang, d.JmlhBatang
    FROM ST_h h
    INNER JOIN ST_d d ON d.NoST = h.NoST
    LEFT JOIN MstJenisKayu k ON k.IdJenisKayu = h.IdJenisKayu
    WHERE h.NoST = @noST
    ORDER BY d.NoUrut
  `);
  return r.recordset;
}

/** null = tidak terkunci (tanpa penerimaan pembelian atau penerimaan tanpa PO). */
async function getPOLock({ noPenerimaan, noST } = {}) {
  const receipt = noST ? await findReceiptOfLabel(noST) : String(noPenerimaan || "").trim();
  if (!receipt) return null;
  const noPO = await findPOOfReceipt(receipt);
  if (!noPO) return null;
  const [po, existing] = await Promise.all([
    service.getByNo(noPO),
    noST ? getLabelItems(noST) : Promise.resolve([]),
  ]);
  return { noPO, noPenerimaanST: receipt, lines: po.lines, existing };
}

/**
 * Lempar 400 bila ada ukuran di luar PO. Dipanggil sebelum label ditulis.
 * Untuk update, nilai yang tidak dikirim memakai data label saat ini.
 */
async function assertLabelSesuaiPO({ noPenerimaan, noST, idJenisKayu, idUOMTebal, details }) {
  const lock = await getPOLock({ noPenerimaan, noST });
  if (!lock) return;

  const current = lock.existing[0];
  const jenis = Number(idJenisKayu ?? current?.IdJenisKayu);
  const uom = Number(idUOMTebal ?? current?.IdUOMTblLebar);
  const rows = Array.isArray(details)
    ? details
    : lock.existing.map((x) => ({ tebal: x.Tebal, lebar: x.Lebar, panjang: x.Panjang }));

  rows.forEach((d, i) => {
    const item = {
      IdJenisKayu: jenis,
      IdUOMTblLebar: uom,
      Tebal: d.tebal,
      Lebar: d.lebar,
      Panjang: d.panjang,
    };
    const allowed =
      lock.lines.some((line) => service.matches(line, item)) ||
      lock.existing.some((old) => service.matches(old, item));
    if (!allowed) {
      throw httpError(
        400,
        `Baris ${i + 1}: ${d.tebal} x ${d.lebar} ${uom === 1 ? "mm" : "inch"} x ${d.panjang} ft ` +
          `dengan jenis kayu ini tidak ada di ${lock.noPO}. ` +
          "Tambahkan di PO, pakai penerimaan tanpa PO, atau catat sebagai Reject.",
      );
    }
  });
}

module.exports = { getPOLock, assertLabelSesuaiPO };
