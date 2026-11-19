// Tes /api/dashboard/home (analytics) tanpa database: db dan dashboard-sawmill tiruan.
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const plain = (v) => JSON.parse(JSON.stringify(v));

function load({ failProduksi = false } = {}) {
  const queries = [];
  const params = [];
  const rows = (q) => {
    if (q.includes("S4SProduksi_h")) {
      if (failProduksi) throw new Error("db down");
      return [
        { k: "s4s", cur: 10, prev: 8, today: 2 },
        { k: "fj", cur: 5, prev: 5, today: 1 },
        { k: "moulding", cur: 0, prev: 0, today: 0 },
        { k: "laminating", cur: 4, prev: 0, today: 0 },
        { k: "ccakhir", cur: 1, prev: 2, today: 0 },
        { k: "sanding", cur: 0, prev: 0, today: 0 },
        { k: "packing", cur: 0, prev: 0, today: 0 },
      ];
    }
    if (q.includes("Penjualan_h")) return [{ k: "st", cur: 3, prev: 6 }, { k: "bj", cur: 4, prev: 2 }];
    if (q.includes("trukCur")) return [{ trukCur: 9, trukPrev: 10, tonCur: 57.7, tonPrev: 141.2 }];
    if (q.includes("bb_ton")) return [{ date: "2026-11-17", bb_ton: 0, st_ton: 8.08 }, { date: "2026-11-18", bb_ton: 15.74, st_ton: 7.48 }];
    if (q.includes("Nyangkut_h")) return [{ Bucket: "0-3", Jumlah: 2 }, { Bucket: ">14", Jumlah: 1 }];
    if (q.includes("DateUsage IS NULL")) return [{ Bucket: "4-7", Jumlah: 3 }];
    return [];
  };
  class Request {
    input(...v) {
      params.push(v);
      return this;
    }
    async query(q) {
      queries.push(q);
      return { recordset: rows(q) };
    }
  }
  const db = { sql: { VarChar: () => "VarChar" }, poolPromise: Promise.resolve({ request: () => new Request() }) };
  const calls = [];
  const sawmill = {
    rendemen: async (k, f, t) => (calls.push(["rendemen", k, f, t]), f === "2026-11-12" ? { kbTon: 101.26, stTon: 21.8, persen: 21.53 } : { kbTon: 90, stTon: 16.5, persen: 18.33 }),
    saldoKb: async () => [{ saldoAwal: 20 }, { saldoAwal: 2.93 }],
    kd: async () => [
      { ruang: "KD 01", lastValue: "[KOSONG]", totalHari: 18 },
      { ruang: "KD 02", lastValue: "[KOSONG]", totalHari: 3 },
      { ruang: "KD 03", lastValue: "JB-25", totalHari: 4 },
    ],
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "src/modules/dashboard-home/dashboard-home-service.js"), "utf8"), {
    module,
    exports: module.exports,
    console: { ...console, error: () => {} },
    Date,
    Math,
    Number,
    String,
    Promise,
    Map,
    Object,
    require: (n) =>
      n.includes("/db")
        ? db
        : n.includes("dashboard-sawmill-service")
          ? sawmill
          : n.includes("dashboard-sawmill-sql")
            ? require(path.join(root, "src/modules/dashboard-sawmill/dashboard-sawmill-sql.js"))
            : require(n),
  });
  return { svc: module.exports, queries, params, calls };
}

const today = new Date(2026, 10, 19, 8, 0, 0);

(async () => {
  // Periode: s.d. kemarin, pembanding sama panjang tepat sebelumnya.
  {
    const { svc } = load();
    assert.deepEqual(plain(svc.periods(7, today)), {
      today: "2026-11-19",
      from: "2026-11-12",
      to: "2026-11-18",
      prevFrom: "2026-11-05",
      prevTo: "2026-11-11",
    });
    assert.equal(svc.periods(30, today).prevTo, "2026-10-19");
    assert.equal(svc.pct(12, 10), 20);
    assert.equal(svc.pct(5, 0), null, "pembanding nol tidak bermakna");
    console.log("PASS periode & persen");
  }

  // Izin penuh: semua domain, delta, tren, dan aging.
  {
    const { svc, calls } = load();
    const d = plain(await svc.getHome({ permissions: new Set(["*"]), range: 7, today }));
    const by = Object.fromEntries(d.domains.map((x) => [x.key, x]));
    assert.deepEqual(d.domains.map((x) => x.key), ["sawmill", "kayu_bulat", "produksi_phu", "produksi_phi", "penjualan", "kd"]);
    assert.equal(by.sawmill.primary.value, 21.53);
    assert.deepEqual(by.sawmill.delta, { value: 3.2, unit: "pts", direction: "up" });
    assert.deepEqual(calls.filter((c) => c[0] === "rendemen").map((c) => c.slice(2)), [["2026-11-12", "2026-11-18"], ["2026-11-05", "2026-11-11"]]);
    assert.equal(by.kayu_bulat.primary.value, 57.7);
    assert.equal(by.kayu_bulat.delta.direction, "down");
    assert.equal(by.kayu_bulat.secondary[1].value, 22.93, "saldo tanpa delta");
    assert.equal(by.produksi_phu.primary.value, 15);
    assert.equal(by.produksi_phu.delta.value, 15.4, "15 vs 13");
    assert.equal(by.produksi_phu.secondary[0].value, 3, "hari ini");
    assert.equal(by.produksi_phi.primary.value, 5);
    assert.equal(by.penjualan.primary.value, 7);
    assert.equal(by.penjualan.delta.value, -12.5);
    assert.equal(by.kd.primary.value, "1 / 3");
    assert.equal(by.kd.delta, null);
    assert.equal(by.kd.secondary[0].value, "KD 01 · 18 hari");
    assert.equal(d.trend.length, 2);
    assert.deepEqual(d.aging.map((a) => a.key), ["nyangkut", "kayu_bulat"]);
    assert.deepEqual(d.aging[0].buckets, [{ bucket: "0-3", count: 2 }, { bucket: "4-7", count: 0 }, { bucket: "8-14", count: 0 }, { bucket: ">14", count: 1 }]);
    assert.equal(d.from, "2026-11-12");
    console.log("PASS izin penuh: domain, delta, tren, aging");
  }

  // Izin sebagian: hanya proses/penjualan yang diizinkan; sumber lain tidak dijalankan.
  {
    const { svc, queries, calls } = load();
    const d = plain(await svc.getHome({ permissions: new Set(["proses_s4s:read", "penjualan_bj:read"]), range: 7, today }));
    assert.deepEqual(d.domains.map((x) => x.key), ["produksi_phu", "penjualan"]);
    assert.equal(d.domains[0].primary.value, 10, "hanya S4S");
    assert.equal(d.domains[0].delta.value, 25);
    assert.deepEqual(d.domains[1].secondary.map((s) => s.label), ["Barang Jadi"]);
    assert.equal(d.domains[1].primary.value, 4);
    assert.equal(d.trend, null);
    assert.deepEqual(d.aging, []);
    assert.equal(calls.length, 0, "rendemen/saldo/kd tidak dipanggil");
    assert.ok(queries.every((q) => !q.includes("Nyangkut_h") && !q.includes("bb_ton")));
    const none = plain(await svc.getHome({ permissions: new Set(), range: 7, today }));
    assert.deepEqual(none.domains, []);
    console.log("PASS izin sebagian: domain & sumber disaring");
  }

  // Cache: panggilan kedua tidak menyentuh DB; sumber gagal tidak menggagalkan yang lain.
  {
    const { svc, queries } = load();
    await svc.getHome({ permissions: new Set(["*"]), range: 14, today });
    const n = queries.length;
    await svc.getHome({ permissions: new Set(["*"]), range: 14, today });
    assert.equal(queries.length, n, "dari cache");
    svc.clearCache();
    await svc.getHome({ permissions: new Set(["*"]), range: 14, today });
    assert.ok(queries.length > n, "cache dikosongkan");

    const f = load({ failProduksi: true });
    const d = plain(await f.svc.getHome({ permissions: new Set(["*"]), range: 7, today }));
    const phu = d.domains.find((x) => x.key === "produksi_phu");
    assert.equal(phu.error, "Data belum dapat dimuat.");
    assert.ok(d.domains.find((x) => x.key === "sawmill").primary, "domain lain tetap");
    console.log("PASS cache & isolasi galat");
  }

  // Controller: validasi range; rute terpasang.
  {
    const controller = { exports: {} };
    let args;
    vm.runInNewContext(fs.readFileSync(path.join(root, "src/modules/dashboard-home/dashboard-home-controller.js"), "utf8"), {
      exports: controller.exports,
      console,
      Number,
      require: () => ({ RANGES: [7, 14, 30, 90], getHome: async (a) => ((args = a), { ok: 1 }) }),
    });
    const res = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
    const bad = res();
    await controller.exports.home({ query: { range: "5" }, userPermissions: new Set() }, bad);
    assert.equal(bad.code, 400);
    const ok = res();
    await controller.exports.home({ query: {}, userPermissions: new Set(["*"]) }, ok);
    assert.equal(ok.code, 200);
    assert.equal(args.range, 7, "bawaan 7 hari");
    assert.ok(fs.readFileSync(path.join(root, "src/app.js"), "utf8").includes('app.use("/api/dashboard/home", dashboardHomeRoutes)'));
    console.log("PASS controller & rute");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
