const { sql, poolPromise } = require("../config/db");

/**
 * Jejak pemakaian label (DateUsage terisi) per tipe label — dipakai addInput
 * seluruh modul produksi untuk memberi tahu proses/no transaksi mana yang
 * sudah memakai label (paritas penjualan-st usedBy + cek list penjualan).
 *
 * Sumber per tipe: junction produksi lintas proses (NoProduksi) → adjustment
 * (NoAdjustment) → bongkar susun (NoBongkarSusun) → penjualan (NoJual/NoBJJual).
 * Daftar tabel diverifikasi via sys.columns (kolom label + NoProduksi ada).
 */
const LABEL_COL = {
  ST: "NoST",
  S4S: "NoS4S",
  CCAKHIR: "NoCCAkhir",
  FJ: "NoFJ",
  MOULDING: "NoMoulding",
  LAMINATING: "NoLaminating",
  BARANGJADI: "NoBJ",
  REPROSES: "NoReproses",
  SANDING: "NoSanding",
  WIP: "NoWIP",
};

const USAGE_SOURCES = {
  ST: [
    { table: "S4SProduksiInputST", ref: "NoProduksi", nama: "Proses Produksi S4S" },
    { table: "WIPProduksiInputST_d", ref: "NoProduksi", nama: "Proses Produksi WIP" },
    { table: "AdjustmentInputST", ref: "NoAdjustment", nama: "Adjustment ST" },
    { table: "BongkarSusunInputST", ref: "NoBongkarSusun", nama: "Bongkar Susun" },
    { table: "PenjualanST", ref: "NoJual", nama: "Penjualan" },
    { table: "STJual_d", ref: "NoSTJual", nama: "Penjualan ST" },
  ],
  S4S: [
    { table: "S4SProduksiInputS4S", ref: "NoProduksi", nama: "Proses Produksi S4S" },
    { table: "FJProduksiInputS4S", ref: "NoProduksi", nama: "Proses Produksi FJ" },
    { table: "MouldingProduksiInputS4S", ref: "NoProduksi", nama: "Proses Produksi Moulding" },
    { table: "AdjustmentInputS4S", ref: "NoAdjustment", nama: "Adjustment S4S" },
    { table: "BongkarSusunInputS4S", ref: "NoBongkarSusun", nama: "Bongkar Susun" },
    { table: "PenjualanS4S", ref: "NoJual", nama: "Penjualan" },
  ],
  CCAKHIR: [
    { table: "CCAkhirProduksiInputCCAkhir", ref: "NoProduksi", nama: "Proses Produksi Cross Cut" },
    { table: "FJProduksiInputCCAkhir", ref: "NoProduksi", nama: "Proses Produksi FJ" },
    { table: "LaminatingProduksiInputCCAkhir", ref: "NoProduksi", nama: "Proses Produksi Laminating" },
    { table: "MouldingProduksiInputCCAkhir", ref: "NoProduksi", nama: "Proses Produksi Moulding" },
    { table: "PackingProduksiInputCCAkhir", ref: "NoProduksi", nama: "Proses Produksi Packing" },
    { table: "S4SProduksiInputCCAkhir", ref: "NoProduksi", nama: "Proses Produksi S4S" },
    { table: "SandingProduksiInputCCAkhir", ref: "NoProduksi", nama: "Proses Produksi Sanding" },
    { table: "AdjustmentInputCCAkhir", ref: "NoAdjustment", nama: "Adjustment Cross Cut" },
    { table: "BongkarSusunInputCCAkhir", ref: "NoBongkarSusun", nama: "Bongkar Susun" },
    { table: "PenjualanCCAkhir", ref: "NoJual", nama: "Penjualan" },
  ],
  FJ: [
    { table: "CCAkhirProduksiInputFJ", ref: "NoProduksi", nama: "Proses Produksi Cross Cut" },
    { table: "MouldingProduksiInputFJ", ref: "NoProduksi", nama: "Proses Produksi Moulding" },
    { table: "S4SProduksiInputFJ", ref: "NoProduksi", nama: "Proses Produksi S4S" },
    { table: "SandingProduksiInputFJ", ref: "NoProduksi", nama: "Proses Produksi Sanding" },
    { table: "AdjustmentInputFJ", ref: "NoAdjustment", nama: "Adjustment FJ" },
    { table: "BongkarSusunInputFJ", ref: "NoBongkarSusun", nama: "Bongkar Susun" },
    { table: "PenjualanFJ", ref: "NoJual", nama: "Penjualan" },
  ],
  MOULDING: [
    { table: "CCAkhirProduksiInputMoulding", ref: "NoProduksi", nama: "Proses Produksi Cross Cut" },
    { table: "LaminatingProduksiInputMoulding", ref: "NoProduksi", nama: "Proses Produksi Laminating" },
    { table: "MouldingProduksiInputMoulding", ref: "NoProduksi", nama: "Proses Produksi Moulding" },
    { table: "PackingProduksiInputMoulding", ref: "NoProduksi", nama: "Proses Produksi Packing" },
    { table: "S4SProduksiInputMoulding", ref: "NoProduksi", nama: "Proses Produksi S4S" },
    { table: "SandingProduksiInputMoulding", ref: "NoProduksi", nama: "Proses Produksi Sanding" },
    { table: "AdjustmentInputMoulding", ref: "NoAdjustment", nama: "Adjustment Moulding" },
    { table: "BongkarSusunInputMoulding", ref: "NoBongkarSusun", nama: "Bongkar Susun" },
    { table: "PenjualanMoulding", ref: "NoJual", nama: "Penjualan" },
  ],
  LAMINATING: [
    { table: "CCAkhirProduksiInputLaminating", ref: "NoProduksi", nama: "Proses Produksi Cross Cut" },
    { table: "MouldingProduksiInputLaminating", ref: "NoProduksi", nama: "Proses Produksi Moulding" },
    { table: "S4SProduksiInputLaminating", ref: "NoProduksi", nama: "Proses Produksi S4S" },
    { table: "AdjustmentInputLaminating", ref: "NoAdjustment", nama: "Adjustment Laminating" },
    { table: "BongkarSusunInputLaminating", ref: "NoBongkarSusun", nama: "Bongkar Susun" },
    { table: "PenjualanLaminating", ref: "NoJual", nama: "Penjualan" },
  ],
  BARANGJADI: [
    { table: "CCAkhirProduksiInputBarangJadi", ref: "NoProduksi", nama: "Proses Produksi Cross Cut" },
    { table: "LaminatingProduksiInputBarangJadi", ref: "NoProduksi", nama: "Proses Produksi Laminating" },
    { table: "MouldingProduksiInputBarangJadi", ref: "NoProduksi", nama: "Proses Produksi Moulding" },
    { table: "PackingProduksiInputBarangJadi", ref: "NoProduksi", nama: "Proses Produksi Packing" },
    { table: "SandingProduksiInputBarangJadi", ref: "NoProduksi", nama: "Proses Produksi Sanding" },
    { table: "WIPProduksiInputBJ_d", ref: "NoProduksi", nama: "Proses Produksi WIP" },
    { table: "AdjustmentInputBJ", ref: "NoAdjustment", nama: "Adjustment Barang Jadi" },
    { table: "BongkarSusunInputBarangJadi", ref: "NoBongkarSusun", nama: "Bongkar Susun" },
    { table: "BJJual_d", ref: "NoBJJual", nama: "Penjualan Barang Jadi" },
  ],
  REPROSES: [
    { table: "CCAkhirProduksiInputReproses", ref: "NoProduksi", nama: "Proses Produksi Cross Cut" },
    { table: "LaminatingProduksiInputReproses", ref: "NoProduksi", nama: "Proses Produksi Laminating" },
    { table: "MouldingProduksiInputReproses", ref: "NoProduksi", nama: "Proses Produksi Moulding" },
    { table: "S4SProduksiInputReproses", ref: "NoProduksi", nama: "Proses Produksi S4S" },
    { table: "SandingProduksiInputReproses", ref: "NoProduksi", nama: "Proses Produksi Sanding" },
    { table: "AdjustmentInputReproses", ref: "NoAdjustment", nama: "Adjustment Reproses" },
    { table: "BongkarSusunInputReproses", ref: "NoBongkarSusun", nama: "Bongkar Susun" },
    { table: "PenjualanReproses", ref: "NoJual", nama: "Penjualan" },
  ],
  SANDING: [
    { table: "CCAkhirProduksiInputSanding", ref: "NoProduksi", nama: "Proses Produksi Cross Cut" },
    { table: "LaminatingProduksiInputSanding", ref: "NoProduksi", nama: "Proses Produksi Laminating" },
    { table: "MouldingProduksiInputSanding", ref: "NoProduksi", nama: "Proses Produksi Moulding" },
    { table: "PackingProduksiInputSanding", ref: "NoProduksi", nama: "Proses Produksi Packing" },
    { table: "SandingProduksiInputSanding", ref: "NoProduksi", nama: "Proses Produksi Sanding" },
    { table: "AdjustmentInputSanding", ref: "NoAdjustment", nama: "Adjustment Sanding" },
    { table: "BongkarSusunInputSanding", ref: "NoBongkarSusun", nama: "Bongkar Susun" },
    { table: "PenjualanSanding", ref: "NoJual", nama: "Penjualan" },
  ],
  WIP: [
    { table: "CCAkhirProduksiInputWIP", ref: "NoProduksi", nama: "Proses Produksi Cross Cut" },
    { table: "FJProduksiInputWIP", ref: "NoProduksi", nama: "Proses Produksi FJ" },
    { table: "LaminatingProduksiInputWIP", ref: "NoProduksi", nama: "Proses Produksi Laminating" },
    { table: "MouldingProduksiInputWIP", ref: "NoProduksi", nama: "Proses Produksi Moulding" },
    { table: "PackingProduksiInputWIP", ref: "NoProduksi", nama: "Proses Produksi Packing" },
    { table: "S4SProduksiInputWIP", ref: "NoProduksi", nama: "Proses Produksi S4S" },
    { table: "SandingProduksiInputWIP", ref: "NoProduksi", nama: "Proses Produksi Sanding" },
    { table: "WIPProduksiInputWIP_d", ref: "NoProduksi", nama: "Proses Produksi WIP" },
    { table: "AdjustmentInputWIP", ref: "NoAdjustment", nama: "Adjustment WIP" },
    { table: "BongkarSusunInputWIP", ref: "NoBongkarSusun", nama: "Bongkar Susun" },
    { table: "PenjualanWIP", ref: "NoJual", nama: "Penjualan" },
    { table: "WIPJual_d", ref: "NoWIPJual", nama: "Penjualan WIP" },
  ],
};

/**
 * Telusuri label ber-DateUsage ke sumber pemakaian pertama yang cocok.
 * Return pesan "sudah dipakai di mana", atau null bila jejak tak ditemukan
 * (data lama) sehingga pemanggil memakai pesan generik.
 */
async function findUsage(type, label) {
  const labelCol = LABEL_COL[type];
  const sources = labelCol ? USAGE_SOURCES[type] : null;
  if (!sources) return null;
  const pool = await poolPromise;
  for (const s of sources) {
    const req = pool.request();
    req.input("lbl", sql.VarChar(50), label);
    const res = await req.query(
      `SELECT TOP 1 ${s.ref} AS v FROM ${s.table} WHERE ${labelCol} = @lbl`,
    );
    if (res.recordset.length > 0) {
      return `Label '${label}' sudah pernah dipakai — ${s.nama}: ${res.recordset[0].v}`;
    }
  }
  return null;
}

module.exports = { findUsage, LABEL_COL, USAGE_SOURCES };
