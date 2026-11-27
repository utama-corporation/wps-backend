// Tes lepas label output & hapus Bongkar Susun tanpa database: db dan periode-lock tiruan.
// Aturan (permintaan user): label output TIDAK PERNAH ikut dihapus; hanya tautannya dilepas.
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const file = "src/modules/bongkar-susun/bongkar-susun-service.js";

/** Tiruan DB. `linked` = apakah label output tertaut ke Bongkar Susun. */
function load({ linked = true, failOn = null, locked = [] } = {}) {
  const queries = [];
  const tx = { began: false, committed: false, rolledBack: false };
  class Request {
    constructor(transaction) {
      this.transaction = transaction;
    }
    input() {
      return this;
    }
    async query(q) {
      queries.push({ q, inTx: !!this.transaction });
      if (failOn && q.includes(failOn)) throw new Error("db galat");
      if (q.includes("FROM BongkarSusun_h WHERE")) {
        return { recordset: [{ NoBongkarSusun: "Z.000010", Tanggal: "2026-11-20" }], rowsAffected: [1] };
      }
      if (q.startsWith("DELETE FROM BongkarSusunOutput")) {
        return { recordset: [], rowsAffected: [linked ? 1 : 0] };
      }
      return { recordset: [], rowsAffected: [0] };
    }
  }
  class Transaction {
    async begin() {
      tx.began = true;
    }
    async commit() {
      tx.committed = true;
    }
    async rollback() {
      tx.rolledBack = true;
    }
  }
  const sql = { Request, Transaction, VarChar: () => "VarChar", Date: "Date", Int: "Int", Bit: "Bit", Decimal: () => "Decimal" };
  const db = { sql, poolPromise: Promise.resolve({ request: () => new Request() }) };
  const periode = {
    assertPeriodeTerbuka: async (tgl) => {
      if (locked.includes(tgl)) {
        const e = new Error("Maaf, Periode ini sudah terkunci");
        e.status = 400;
        throw e;
      }
    },
    getKunciPeriode: async () => ({ kunci: null }),
  };
  const labelModuleCalls = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), {
    module,
    exports: module.exports,
    console,
    require: (n) => {
      if (n.includes("/db")) return db;
      if (n.includes("periode-lock")) return periode;
      if (n.includes("penjualan-st-service")) return {};
      // Modul label tidak boleh dipanggil untuk menghapus label.
      if (n.includes("/label/")) return { deleteLabel: async (l) => labelModuleCalls.push(l) };
      return require(n);
    },
  });
  return { svc: module.exports, queries, tx, labelModuleCalls };
}

const writes = (queries) =>
  queries.filter((x) => /^\s*(DELETE|UPDATE|INSERT)/.test(x.q)).map((x) => x.q.trim().split(/\s+/).slice(0, 3).join(" "));

(async () => {
  // Lepas satu label output: hanya baris tautan yang dihapus, label tetap ada.
  {
    const { svc, queries, tx, labelModuleCalls } = load();
    const res = await svc.deleteOutputLabel("Z.000010", " r.000123 ", "operator");
    assert.deepEqual(JSON.parse(JSON.stringify(res)), { noBongkarSusun: "Z.000010", label: "R.000123" });
    const deletes = queries.filter((x) => x.q.startsWith("DELETE FROM"));
    assert.equal(deletes.length, 1, "hanya satu DELETE");
    assert.ok(deletes[0].q.startsWith("DELETE FROM BongkarSusunOutputS4S WHERE NoBongkarSusun = @no AND NoS4S = @label"));
    assert.ok(deletes[0].inTx);
    assert.ok(!queries.some((x) => /DELETE FROM (S4S_h|S4S_d)\b/.test(x.q)), "label & detail tidak dihapus");
    assert.ok(queries.some((x) => x.inTx && x.q.includes("INSERT INTO Riwayat")), "riwayat dicatat");
    assert.equal(labelModuleCalls.length, 0);
    assert.ok(tx.committed && !tx.rolledBack);
    console.log("PASS lepas label output: hanya tautan, label tetap, riwayat dicatat");
  }

  // Penolakan: bukan output Bongkar Susun ini, label tidak dikenal, periode terkunci.
  {
    const notLinked = load({ linked: false });
    await assert.rejects(
      () => notLinked.svc.deleteOutputLabel("Z.000010", "E.000555", "u"),
      (e) => e.status === 404 && /bukan label output/.test(e.message),
    );
    assert.ok(notLinked.tx.rolledBack && !notLinked.tx.committed, "tidak ada yang tersimpan");

    const bad = load();
    await assert.rejects(() => bad.svc.deleteOutputLabel("Z.000010", "Q", "u"), (e) => e.status === 400);
    assert.equal(bad.tx.began, false);

    const locked = load({ locked: ["2026-11-20"] });
    await assert.rejects(() => locked.svc.deleteOutputLabel("Z.000010", "R.000123", "u"), /terkunci/);
    assert.equal(locked.tx.began, false);
    console.log("PASS penolakan lepas output: bukan output, label salah, periode terkunci");
  }

  // Hapus seluruh Bongkar Susun: input dilepas, tautan output dilepas, LABEL OUTPUT TIDAK DIHAPUS.
  {
    const { svc, queries, tx, labelModuleCalls } = load();
    const res = await svc.deleteHeader("Z.000010", "operator");
    assert.equal(res.noBongkarSusun, "Z.000010");
    assert.equal(labelModuleCalls.length, 0, "modul label tidak dipanggil");
    const w = writes(queries);
    assert.equal(w.filter((x) => x.startsWith("UPDATE h SET")).length, 8, "DateUsage input dilepas untuk 8 tipe");
    for (const t of ["ST", "S4S", "FJ", "Moulding", "Laminating", "CCAkhir", "Sanding", "BarangJadi"]) {
      assert.ok(w.includes(`DELETE FROM BongkarSusunInput${t}`), `input ${t}`);
      assert.ok(w.includes(`DELETE FROM BongkarSusunOutput${t}`), `tautan output ${t}`);
    }
    assert.ok(!queries.some((x) => /DELETE FROM (ST|S4S|FJ|Moulding|Laminating|CCAkhir|Sanding|BarangJadi)_(h|d)\b/.test(x.q)), "label tidak dihapus");
    assert.ok(w.includes("DELETE FROM dbo.BongkarSusun_h"));
    assert.ok(queries.filter((x) => /^\s*(DELETE|UPDATE|INSERT)/.test(x.q)).every((x) => x.inTx), "semua dalam transaksi");
    assert.ok(tx.committed && !tx.rolledBack);
    console.log("PASS hapus Bongkar Susun: input & tautan output dilepas, label output tetap ada");
  }

  // Hapus Bongkar Susun gagal di tengah: rollback.
  {
    const { svc, tx } = load({ failOn: "DELETE FROM BongkarSusunOutputFJ" });
    await assert.rejects(() => svc.deleteHeader("Z.000010", "u"), /db galat/);
    assert.ok(tx.rolledBack && !tx.committed);
    console.log("PASS hapus Bongkar Susun: rollback saat galat");
  }

  // Berkas service: hanya satu deleteHeader, tidak ada penghapus label output tersisa.
  {
    const src = fs.readFileSync(path.join(root, file), "utf8");
    assert.equal((src.match(/async function deleteHeader/g) || []).length, 1);
    assert.ok(!src.includes("OUTPUT_LABEL_DELETERS"));
    assert.ok(!/\r(?!\n)/.test(src), "tidak ada akhir baris \\r tunggal");
    console.log("PASS berkas service: satu deleteHeader, tanpa penghapus label output");
  }

  // Hapus label S4S dari menu Label: tautan Bongkar Susun ikut dihapus, dalam transaksi.
  {
    const queries = [];
    const tx = { committed: false, rolledBack: false };
    class Request {
      constructor(t) {
        this.t = t;
      }
      input() {
        return this;
      }
      async query(q) {
        queries.push({ q, inTx: !!this.t });
        return { recordset: q.includes("SELECT DateCreate") ? [{ DateCreate: "2026-11-20" }] : [] };
      }
    }
    class Transaction {
      async begin() {}
      async commit() {
        tx.committed = true;
      }
      async rollback() {
        tx.rolledBack = true;
      }
    }
    const db = { sql: { Request, Transaction, VarChar: () => "VarChar" }, poolPromise: Promise.resolve({ request: () => new Request() }) };
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, "src/modules/label/s4s/label-s4s-service.js"), "utf8"), {
      module,
      exports: module.exports,
      console,
      require: (n) =>
        n.includes("/db")
          ? db
          : n.includes("periode-lock")
            ? { assertPeriodeTerbuka: async () => {} }
            : n.includes("print-limit")
              ? { claimPrint: async () => true, releasePrint: async () => {} }
              : n === "moment"
                ? () => ({ format: () => "" })
                : require(n),
    });
    // Sejak Print Limit/Audit Trail, transaksi dibuka controller (withAudit) lalu diteruskan ke service.
    const auditTx = { request: () => new Request(true) };
    await module.exports.deleteLabel("R.000123", auditTx);
    const deletes = queries.filter((x) => x.q.startsWith("DELETE FROM")).map((x) => x.q.split(" ")[2]);
    assert.deepEqual(deletes, ["BongkarSusunOutputS4S", "S4SProduksiOutput", "CCAkhirProduksiOutputS4S", "S4S_d", "S4S_h"]);
    assert.ok(queries.filter((x) => x.q.startsWith("DELETE FROM")).every((x) => x.inTx), "semua DELETE lewat transaksi controller");
    assert.ok(!tx.committed && !tx.rolledBack, "service tidak membuka/menutup transaksi sendiri");
    const ctrl = fs.readFileSync(path.join(root, "src/modules/label/s4s/label-s4s-controller.js"), "utf8");
    assert.ok(/withAudit\([^)]*\),?\s*\(tx\)\s*=>\s*\n?\s*labelS4sService\.deleteLabel\(NoS4S, tx\)/.test(ctrl), "controller membungkus hapus dalam transaksi audit");
    console.log("PASS hapus label S4S (menu Label): tautan BongkarSusunOutputS4S ikut, dalam transaksi");
  }

  // Rute terdaftar dengan izin hapus Bongkar Susun.
  {
    const routes = fs.readFileSync(path.join(root, "src/modules/bongkar-susun/bongkar-susun-routes.js"), "utf8");
    assert.ok(routes.includes('router.delete("/bongkar-susun/:no/output", requirePermission("bongkar_susun:delete"), ctrl.deleteOutputLabel)'));
    assert.ok(routes.includes('router.delete("/bongkar-susun/:no", requirePermission("bongkar_susun:delete"), ctrl.deleteHeader)'));
    console.log("PASS rute DELETE /bongkar-susun/:no dan /:no/output");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
