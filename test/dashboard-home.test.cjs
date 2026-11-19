// Tes endpoint baru untuk Dashboard tablet: SPK aktif, target rendemen, dan aktivitas saya.
// Tanpa database: modul db diganti tiruan yang mencatat query dan parameter.
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");

function fakeDb(rows) {
  const queries = [];
  const params = [];
  class Request {
    input(...v) {
      params.push(v);
      return this;
    }
    async query(q) {
      queries.push(q);
      return { recordset: rows, recordsets: [rows] };
    }
  }
  const type = (name) => Object.assign(() => name, { toString: () => name });
  const sql = { VarChar: type("VarChar"), NVarChar: type("NVarChar"), Int: "Int", DateTime2: "DateTime2" };
  return { queries, params, db: { sql, poolPromise: Promise.resolve({ request: () => new Request() }) } };
}

function load(file, db, env = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), {
    module,
    exports: module.exports,
    console,
    process: { env },
    require: (name) => {
      if (name.includes("/db")) return db;
      if (name === "./dashboard-sawmill-sql") {
        return require(path.join(root, "src/modules/dashboard-sawmill/dashboard-sawmill-sql.js"));
      }
      return require(name);
    },
  });
  return module.exports;
}

const res = () => ({
  code: 200,
  body: null,
  status(c) {
    this.code = c;
    return this;
  },
  json(b) {
    this.body = b;
    return this;
  },
});

(async () => {
  // SPK aktif: persen dan sisa dihitung dari target dan realisasi.
  {
    const h = fakeDb([
      { noSpk: "SPK/1", tanggal: "2026-11-01", buyer: "B", idProdukSpk: 3, produk: "P", targetTon: 50, realisasiTon: 20.12345 },
      { noSpk: "SPK/2", tanggal: "2026-10-01", buyer: null, idProdukSpk: 4, produk: "Q", targetTon: 10, realisasiTon: 12 },
      { noSpk: "SPK/3", tanggal: "2026-10-01", buyer: null, idProdukSpk: 5, produk: "R", targetTon: 8, realisasiTon: null },
    ]);
    const service = load("src/modules/dashboard-sawmill/dashboard-sawmill-service.js", h.db);
    const rows = await service.spkAktif();
    assert.equal(rows.length, 3);
    assert.equal(rows[0].persen, 40.25);
    assert.equal(rows[0].sisaTon, 29.8766);
    assert.equal(rows[1].persen, 120);
    assert.equal(rows[1].sisaTon, -2);
    assert.equal(rows[2].realisasiTon, 0);
    assert.equal(rows[2].persen, 0);
    const q = h.queries[0];
    assert(q.includes("ISNULL(H.[Enable], 0) = 1"), "hanya header SPK aktif");
    assert(q.includes("ISNULL(S.IsEnable, 0) = 1"), "hanya produk SPK aktif");
    assert(q.includes("D.NoSPK = S.NoSPK AND D.IdProdukSPK = S.IdProdukSPK"), "realisasi per SPK+produk");
    console.log("PASS spk-aktif: persen, sisa, filter aktif");
  }

  // Target rendemen dari env; nilai kosong/tidak valid jadi null.
  {
    const h = fakeDb([]);
    const set = load("src/modules/dashboard-sawmill/dashboard-sawmill-service.js", h.db, {
      TARGET_RENDEMEN_BANSAW: "48,5",
      TARGET_RENDEMEN_SLP: "abc",
    });
    assert.deepEqual(JSON.parse(JSON.stringify(await set.targetRendemen())), { bansaw: 48.5, slp: null });
    const empty = load("src/modules/dashboard-sawmill/dashboard-sawmill-service.js", h.db, {
      TARGET_RENDEMEN_BANSAW: "150",
    });
    assert.deepEqual(JSON.parse(JSON.stringify(await empty.targetRendemen())), { bansaw: null, slp: null });
    console.log("PASS target-rendemen: env, koma desimal, batas 0-100");
  }

  // Aktivitas saya: pelaku dari token, limit dibatasi, dikelompokkan per RequestId.
  {
    const h = fakeDb([
      { AuditId: 9, RequestId: "r-1", Action: "INSERT", TableName: "S4SProduksi_h", PK: '{"NoProduksi":"R.1"}', Jumlah: 3, EventTime: "2026-11-19 08:00:00.000" },
    ]);
    const service = load("src/modules/audit/audit-service.js", h.db);
    const rows = await service.getMyActivity({ idUsername: 12, username: "operator", limit: 999 });
    assert.equal(rows.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(rows[0].pk)), { NoProduksi: "R.1" });
    assert.equal(rows[0].rows, 3);
    const p = Object.fromEntries(h.params.map((v) => [v[0], v[2]]));
    assert.equal(p.actor1, "12");
    assert.equal(p.actor2, "operator");
    assert.equal(p.limit, 20, "limit dibatasi maksimal 20");
    assert(h.queries[0].includes("PARTITION BY Grp"), "dikelompokkan per RequestId");
    assert(h.queries[0].includes("DATEADD(DAY, -@days"), "dibatasi beberapa hari terakhir");
    assert.deepEqual(JSON.parse(JSON.stringify(await service.getMyActivity({}))), []);

    // Controller memakai identitas dari token, bukan parameter query.
    let captured;
    const controller = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, "src/modules/audit/audit-controller.js"), "utf8"), {
      exports: controller.exports,
      console,
      require: () => ({ getMyActivity: async (args) => ((captured = args), []) }),
    });
    const r = res();
    await controller.exports.getMyActivity({ idUsername: 7, username: "andi", query: { actor: "99", limit: "5" } }, r);
    assert.equal(r.code, 200);
    assert.equal(r.body.success, true);
    assert.deepEqual(JSON.parse(JSON.stringify(captured)), { idUsername: 7, username: "andi", limit: "5" });
    console.log("PASS audit/me: pelaku dari token, limit, pengelompokan");
  }

  // Rute terdaftar dan /audit/me ada sebelum /audit/:auditId.
  {
    const routes = fs.readFileSync(path.join(root, "src/modules/audit/audit-routes.js"), "utf8");
    assert(routes.indexOf('"/audit/me"') < routes.indexOf('"/audit/:auditId"'));
    const ds = fs.readFileSync(path.join(root, "src/modules/dashboard-sawmill/dashboard-sawmill-routes.js"), "utf8");
    assert(ds.includes('"/spk-aktif"') && ds.includes('"/target-rendemen"'));
    console.log("PASS routes: urutan audit/me dan rute dashboard");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
