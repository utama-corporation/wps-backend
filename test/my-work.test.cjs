// Tes modul Pekerjaan Saya (my-work) tanpa database: db dan dashboard-sawmill diganti tiruan.
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const plain = (v) => JSON.parse(JSON.stringify(v));

function load({ rowsFor = () => [], saldo = [], spk = [], failNyangkut = false } = {}) {
  const queries = [];
  const request = () => ({
    async query(q) {
      queries.push(q);
      if (failNyangkut && q.includes("Nyangkut_h")) throw new Error("db down");
      return { recordset: rowsFor(q) };
    },
  });
  const db = { poolPromise: Promise.resolve({ request }) };
  const dashboard = { saldoKb: async () => saldo, spkAktif: async () => spk };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "src/modules/my-work/my-work-service.js"), "utf8"), {
    module,
    exports: module.exports,
    console: { ...console, error: () => {} },
    Date,
    Math,
    Number,
    String,
    Promise,
    require: (n) => (n.includes("/db") ? db : n.includes("dashboard-sawmill-service") ? dashboard : require(n)),
  });
  return { svc: module.exports, queries };
}

const rows = (q) => {
  if (q.includes("Nyangkut_h")) return [{ NoNyangkut: "N.002", Tgl: "2026-11-19" }, { NoNyangkut: "N.001", Tgl: "2026-11-18" }];
  if (q.includes("StockOpname_h")) return [{ NoSO: "SO.010", Tgl: "2026-11-19" }];
  if (q.includes("MstTutupTransaksiHarian") && q.includes("Lock = 1")) return [{ Terakhir: "2026-11-14" }];
  return [];
};
const saldo = [
  { jenis: "RAMBUNG", utStatus: "bahaya", ut: 2, utDaftar: [{ noKayuBulat: "A.1", supplier: "HALDI" }, { noKayuBulat: "A.2", supplier: "PAIJO" }] },
  { jenis: "PULAI", utStatus: "peringatan", ut: 1, utDaftar: [{ noKayuBulat: "A.3", supplier: "" }] },
  { jenis: "JABON", utStatus: "aman", ut: 9, utDaftar: [{ noKayuBulat: "A.9", supplier: "X" }] },
];
const spk = [
  { noSpk: "SPK/1", idProdukSpk: 1, produk: "ST", tanggal: "2026-10-01", targetTon: 10, realisasiTon: 12, persen: 120 },
  { noSpk: "SPK/2", idProdukSpk: 2, produk: "ST2", tanggal: "2026-10-02", targetTon: 10, realisasiTon: 4, persen: 40 },
];
const today = new Date(2026, 10, 19, 8, 0, 0);

(async () => {
  // Izin penuh: semua kategori, urutan mendesak dulu, isi dan tingkat urgensi benar.
  {
    const { svc } = load({ rowsFor: rows, saldo, spk });
    const s = plain(await svc.getSummary({ permissions: new Set(["*"]), today }));
    assert.deepEqual(s.categories.map((c) => c.key), ["kayu_bulat_lama", "tutup_harian", "nyangkut", "spk_lewat_target", "stock_opname"]);
    const by = Object.fromEntries(s.categories.map((c) => [c.key, c]));
    assert.equal(by.kayu_bulat_lama.count, 3, "hanya UT peringatan/bahaya");
    assert.equal(by.kayu_bulat_lama.severity, "danger");
    assert.equal(by.kayu_bulat_lama.items[0].severity, "danger", "bahaya di atas");
    assert.equal(by.kayu_bulat_lama.items[0].target, "kayu_bulat");
    assert.equal(by.tutup_harian.count, 1);
    assert.equal(by.tutup_harian.items[0].title, "4 hari belum dikunci", "15-18 Nov belum dikunci");
    assert.equal(by.tutup_harian.items[0].severity, "danger", "lebih dari 3 hari");
    assert.equal(by.nyangkut.count, 2);
    assert.equal(by.nyangkut.items[0].targetNo, "N.002");
    assert.equal(by.spk_lewat_target.count, 1, "hanya SPK >= 100%");
    assert.equal(by.stock_opname.count, 1);
    assert.equal(s.total, 8);
    assert.ok(s.generated_at);
    console.log("PASS summary: kategori, urutan, isi, urgensi, total");
  }

  // Izin disaring: hanya kategori yang diizinkan, query lain tidak dijalankan.
  {
    const { svc, queries } = load({ rowsFor: rows, saldo, spk });
    const s = plain(await svc.getSummary({ permissions: new Set(["nyangkut:read"]), today }));
    assert.deepEqual(s.categories.map((c) => c.key), ["nyangkut"]);
    assert.ok(queries.every((q) => !q.includes("StockOpname_h")));
    const none = plain(await svc.getSummary({ permissions: new Set(["label_st:read"]), today }));
    assert.deepEqual(none.categories, []);
    assert.equal(none.total, 0);
    console.log("PASS izin: kategori disaring per izin");
  }

  // Kategori gagal tidak menggagalkan yang lain; kosong tanpa urgensi.
  {
    const { svc } = load({ rowsFor: () => [], failNyangkut: true });
    const s = plain(await svc.getSummary({ permissions: new Set(["nyangkut:read", "stock_opname:read"]), today }));
    const by = Object.fromEntries(s.categories.map((c) => [c.key, c]));
    assert.equal(by.nyangkut.count, null);
    assert.equal(by.nyangkut.error, "Data belum dapat dimuat.");
    assert.equal(by.stock_opname.count, 0);
    assert.equal(by.stock_opname.severity, null);
    console.log("PASS isolasi galat: satu kategori gagal, yang lain tetap");
  }

  // Tutup harian sudah sampai kemarin: tidak ada item.
  {
    const { svc } = load({ rowsFor: (q) => (q.includes("Lock = 1") ? [{ Terakhir: "2026-11-18" }] : []) });
    const s = plain(await svc.getSummary({ permissions: new Set(["tutup_transaksi:read"]), today }));
    assert.equal(s.categories[0].count, 0);
    console.log("PASS tutup harian: kosong bila sudah dikunci sampai kemarin");
  }

  // Daftar berhalaman; kategori asing/tidak diizinkan -> null.
  {
    const { svc } = load({ rowsFor: rows, saldo, spk });
    const page = plain(await svc.getList({ permissions: new Set(["*"]), category: "kayu_bulat_lama", page: 2, perPage: 2, today }));
    assert.deepEqual(page.meta, { page: 2, per_page: 2, total: 3, total_pages: 2 });
    assert.equal(page.data.length, 1);
    assert.equal(await svc.getList({ permissions: new Set(["nyangkut:read"]), category: "stock_opname", today }), null);
    assert.equal(await svc.getList({ permissions: new Set(["*"]), category: "tidak-ada", today }), null);
    console.log("PASS list: halaman, kategori asing & tanpa izin");
  }

  // Rute terpasang tanpa requirePermission global, dan di app.js.
  {
    const routes = fs.readFileSync(path.join(root, "src/modules/my-work/my-work-routes.js"), "utf8");
    assert.ok(routes.includes('"/summary"') && routes.includes('"/list"'));
    assert.ok(!routes.includes("requirePermission("));
    assert.ok(fs.readFileSync(path.join(root, "src/app.js"), "utf8").includes('app.use("/api/my-work", myWorkRoutes)'));
    console.log("PASS rute: /api/my-work/summary dan /list");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
