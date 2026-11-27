// Tes Laporan Pengupahan tanpa database: header Stick By, baris per tanggal + tebal,
// pemisahan pendek/panjang, grand total, validasi query, dan pemasangan rute/izin.
const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const plain = (v) => JSON.parse(JSON.stringify(v));
const modul = path.join(root, "src/modules/laporan-pengupahan");

const baris = (NoST, Tanggal, NamaStickBy, Tebal, IdUOMTblLebar, JumlahTingkat, JenisBundleStick, TarifUpahStick, UpahStick, KeteranganUpahStick = null) => ({
  NoST,
  Tanggal,
  NamaStickBy,
  Tebal,
  IdUOMTblLebar,
  JumlahTingkat,
  JenisBundleStick,
  TarifUpahStick,
  UpahStick,
  KeteranganUpahStick,
});

const fixtures = [
  baris("E.001", "2026-11-01 08:30:00", "Stick Lima", 25, 1, 4, "PENDEK", 2100, 8400),
  baris("E.002", "2026-11-01", "Stick Lima", 25, 1, 2, "PANJANG", 1500, 3000),
  baris("E.003", "2026-11-02", "Stick Lima", 50, 1, 3, "PENDEK", 2500, 7500),
  baris("E.004", "2026-11-02", "Stick Satu", 1, 3, 5, "PANJANG", 1000, 5000),
  baris("E.005", "2026-11-03", "Stick Satu", 25.4, 1, 1, "PENDEK", null, null, "Tarif belum diatur untuk tebal 25,4 mm"),
];

const queries = [];
const params = [];
class Request {
  input(...v) {
    params.push(v);
    return this;
  }
  async query(q) {
    queries.push(q);
    if (q.includes("SELECT NoST, DateCreate FROM dbo.ST_h")) {
      return {
        recordset: [
          { NoST: "E.000", DateCreate: "2026-10-31" },
          { NoST: "E.001", DateCreate: "2026-11-02" },
          { NoST: "E.002", DateCreate: "2026-11-03" },
        ],
      };
    }
    return { recordset: fixtures };
  }
}
const dbPath = path.join(root, "src/core/config/db.js");
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { sql: { Date: () => "Date", VarChar: () => "VarChar" }, poolPromise: Promise.resolve({ request: () => new Request() }) },
};

const svc = require(path.join(modul, "laporan-pengupahan-service.js"));
const laporanReport = require(path.join(modul, "laporan-pengupahan-report.js"));

(async () => {
  let laporan;
  {
    const out = await svc.getLaporan("2026-11-01", "2026-11-30");
    laporan = out;
    assert.equal(out.awal, "2026-11-01");
    assert.equal(out.akhir, "2026-11-30");
    assert.deepEqual(params.map((p) => p[0]), ["awal", "akhir"]);
    assert.match(queries[0], /A\.DateCreate >= @awal AND A\.DateCreate < DATEADD\(DAY, 1, @akhir\)/);
    assert.match(queries[0], /A\.JumlahTingkat IS NOT NULL/);
    assert.match(queries[0], /LEFT JOIN MstStickBy/);

    // Header group = Stick By; baris = tanggal + tebal (label sama tanggal & tebal digabung).
    assert.deepEqual(out.groups.map((g) => g.nama), ["Stick Lima", "Stick Satu"]);
    const lima = out.groups[0];
    assert.deepEqual(plain(lima.rows), [
      {
        no: 1,
        tanggal: "2026-11-01",
        tebal: 25,
        jumlahLabel: 2,
        tingkatPendek: 4,
        upahPendek: 8400,
        tingkatPanjang: 2,
        upahPanjang: 3000,
        totalUpah: 11400,
        keterangan: null,
      },
      {
        no: 2,
        tanggal: "2026-11-02",
        tebal: 50,
        jumlahLabel: 1,
        tingkatPendek: 3,
        upahPendek: 7500,
        tingkatPanjang: 0,
        upahPanjang: 0,
        totalUpah: 7500,
        keterangan: null,
      },
    ]);
    assert.deepEqual(plain(lima.total), {
      tingkatPendek: 7,
      upahPendek: 15900,
      tingkatPanjang: 2,
      upahPanjang: 3000,
      totalUpah: 18900,
    });
    const satu = out.groups[1];
    // Inch (Tebal 1) dinormalisasi ke 25,4 mm; nomor urut berlanjut antar kru.
    assert.deepEqual(satu.rows.map((r) => [r.no, r.tanggal, r.tebal]), [
      [3, "2026-11-02", 25.4],
      [4, "2026-11-03", 25.4],
    ]);
    assert.equal(satu.rows[1].keterangan, "Tarif belum diatur untuk tebal 25,4 mm");
    assert.deepEqual(plain(satu.total), {
      tingkatPendek: 1,
      upahPendek: 0,
      tingkatPanjang: 5,
      upahPanjang: 5000,
      totalUpah: 5000,
    });
    assert.deepEqual(plain(out.grandTotal), {
      tingkatPendek: 8,
      upahPendek: 15900,
      tingkatPanjang: 7,
      upahPanjang: 8000,
      totalUpah: 23900,
    });
    // Tanggal & tebal sama dari label berbeda -> satu baris; alasan unik digabung.
    const gabung = svc.grup([
      svc.baris(baris("E.1", "2026-11-05", "K", 30, 1, 2, "PENDEK", null, null, "Tarif belum diatur untuk tebal 30 mm"), 1),
      svc.baris(baris("E.2", "2026-11-05", "K", 30, 1, 3, "PENDEK", null, null, "Tarif belum diatur untuk tebal 30 mm"), 2),
      svc.baris(baris("E.3", "2026-11-04", "K", 30, 1, 1, "PANJANG", 900, 900), 3),
    ]);
    assert.deepEqual(gabung[0].rows.map((r) => [r.tanggal, r.jumlahLabel, r.tingkatPendek + r.tingkatPanjang]), [
      ["2026-11-04", 1, 1],
      ["2026-11-05", 2, 5],
    ]);
    assert.equal(gabung[0].rows[1].keterangan, "Tarif belum diatur untuk tebal 30 mm");
    console.log("PASS header Stick By, baris per tanggal + tebal, subtotal kru, grand total");
  }

  {
    const html = laporanReport.buildHtml(laporan);
    assert.ok(html.includes("<h1>Rekap Pengupahan Stick</h1>"), "judul laporan");
    const sumber = fs.readFileSync(path.join(modul, "laporan-pengupahan-report.js"), "utf8");
    assert.ok(sumber.includes("<span>WPS - Rekap Pengupahan Stick</span>"), "footer PDF");
    assert.ok(sumber.includes('title: "WPS - Rekap Pengupahan Stick"'), "judul dokumen PDF");
    assert.match(html, /Periode: 2026-11-01 s\/d 2026-11-30/);
    assert.match(html, /<td colspan="8">Stick Lima<\/td>/);
    assert.match(html, /<td colspan="8">Stick Satu<\/td>/);
    assert.ok(!html.includes("| Tebal"), "tebal tidak lagi di header group");
    assert.match(html, /Subtotal Stick Lima</);
    assert.match(html, /<td class="c">25,4<\/td>/);
    assert.match(html, /Tarif belum diatur untuk tebal 25,4 mm/);
    assert.match(html, /class="catatan"/);
    assert.match(html, /Tingkat Pendek/);
    assert.match(html, /Tingkat Panjang/);
    assert.match(html, /@page \{ size: A4 portrait; \}/);
    assert.match(html, /Rp 11\.400,00/);
    assert.match(html, /Rp 18\.900,00/);
    assert.match(html, /GRAND TOTAL/);
    assert.match(html, /Rp 23\.900,00/);
    assert.match(laporanReport.rupiah(1500.5), /Rp 1\.500,50/);
    assert.ok(!html.includes("<script"), "tanpa skrip eksternal");
    console.log("PASS HTML PDF: header Stick By, baris tanggal + tebal, subtotal, grand total");
  }

  {
    // Controller: validasi tanggal wajib dan format YYYY-MM-DD.
    const svcPath = path.join(modul, "laporan-pengupahan-service.js");
    const reportPath = path.join(modul, "laporan-pengupahan-report.js");
    const ctrlPath = path.join(modul, "laporan-pengupahan-controller.js");
    let dipanggil, dibuat;
    const pdfBuffer = Buffer.from("%PDF-1.4 tiruan");
    require.cache[reportPath] = {
      id: reportPath,
      filename: reportPath,
      loaded: true,
      exports: {
        generate: async (args) => {
          dibuat = args;
          return pdfBuffer;
        },
      },
    };
    require.cache[svcPath] = {
      id: svcPath,
      filename: svcPath,
      loaded: true,
      exports: {
        getLaporan: async (a, b) => {
          dipanggil = [a, b];
          return laporan;
        },
      },
    };
    delete require.cache[ctrlPath];
    const ctrl = require(ctrlPath);
    const res = () => {
      const out = { statusCode: 200, body: null, headers: null, ended: null };
      out.status = (code) => {
        out.statusCode = code;
        return out;
      };
      out.json = (body) => {
        out.body = body;
        return out;
      };
      out.set = (headers) => {
        out.headers = headers;
        return out;
      };
      out.end = (bytes) => {
        out.ended = bytes;
        return out;
      };
      return out;
    };
    for (const query of [{}, { start_date: "2026-11-01" }, { start_date: "01-11-2026", end_date: "2026-11-30" }]) {
      const r = res();
      await ctrl.index({ query }, r);
      assert.equal(r.statusCode, 400, JSON.stringify(query));
    }
    const terbalik = res();
    await ctrl.index({ query: { start_date: "2026-11-30", end_date: "2026-11-01" } }, terbalik);
    assert.equal(terbalik.statusCode, 400);
    const ok = res();
    await ctrl.index({ query: { start_date: "2026-11-01", end_date: "2026-11-30" } }, ok);
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.body.success, true);
    assert.deepEqual(dipanggil, ["2026-11-01", "2026-11-30"]);

    const pdf = res();
    await ctrl.pdf({ query: { start_date: "2026-11-01", end_date: "2026-11-30" }, username: "admin" }, pdf);
    assert.equal(pdf.statusCode, 200);
    assert.equal(pdf.headers["Content-Type"], "application/pdf");
    assert.equal(pdf.headers["Content-Length"], pdfBuffer.length);
    assert.equal(pdf.headers["Content-Disposition"], 'inline; filename="RekapPengupahanStick_2026-11-01_2026-11-30.pdf"');
    assert.equal(pdf.ended, pdfBuffer);
    assert.equal(dibuat.printedBy, "admin");
    assert.equal(dibuat.awal, "2026-11-01");
    assert.equal(dibuat.grandTotal.totalUpah, 23900);
    assert.equal(dibuat.groups.length, 2);
    const pdfSalah = res();
    await ctrl.pdf({ query: { start_date: "2026-11-01" } }, pdfSalah);
    assert.equal(pdfSalah.statusCode, 400);
    console.log("PASS validasi tanggal, respons JSON, dan stream PDF");
  }

  {
    // Master tarif: hitung ulang snapshot upah label lama setelah tarif diperbaiki.
    const master = require(path.join(root, "src/modules/master-tarif-upah-stick/master-tarif-upah-stick-service.js"));
    const diproses = [];
    const sebelum = queries.length;
    const out = await master.hitungUlangRentang("2026-11-01", "2026-11-30", {
      user: "admin",
      // Periode s.d. 31 Okt sudah ditutup: E.000 tidak boleh diubah.
      terbuka: async (tgl) => String(tgl) > "2026-10-31",
      recalc: async (noST) => {
        diproses.push(noST);
        return { keterangan: noST === "E.002" ? "Tarif belum diatur untuk tebal 31 mm" : null };
      },
    });
    assert.deepEqual(diproses, ["E.001", "E.002"], "label periode terkunci dilewati");
    assert.deepEqual(plain(out), {
      awal: "2026-11-01",
      akhir: "2026-11-30",
      diproses: 3,
      dihitungUlang: 2,
      belumBerdasarkanTarif: [{ noST: "E.002", keterangan: "Tarif belum diatur untuk tebal 31 mm" }],
      dilewatiPeriodeTerkunci: ["E.000"],
    });
    const riwayat = queries.slice(sebelum).filter((q) => q.includes("INSERT INTO Riwayat"));
    assert.equal(riwayat.length, 1, "hitung ulang dicatat di Riwayat");
    assert.ok(
      fs.readFileSync(path.join(root, "src/modules/master-tarif-upah-stick/master-tarif-upah-stick-controller.js"), "utf8")
        .includes("{ user: req.username }"),
      "controller meneruskan pelaku",
    );
    for (const bad of [{ start_date: "x", end_date: "2026-11-30" }, { start_date: "2026-11-30", end_date: "2026-11-01" }]) {
      await assert.rejects(
        () => master.hitungUlangRentang(bad.start_date, bad.end_date, async () => ({})),
        (e) => e.status === 400,
      );
    }
    const routes = fs.readFileSync(path.join(root, "src/modules/master-tarif-upah-stick/master-tarif-upah-stick-routes.js"), "utf8");
    assert.ok(routes.includes('router.post("/hitung-ulang"'));
    assert.ok(routes.indexOf('router.post("/hitung-ulang"') < routes.indexOf('router.put("/:id"'));
    console.log("PASS hitung ulang snapshot label lama dari master tarif");
  }

  {
    const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
    const routes = read("src/modules/laporan-pengupahan/laporan-pengupahan-routes.js");
    assert.ok(routes.includes("laporan:read"));
    assert.ok(routes.includes("laporan:st:read"));
    assert.ok(routes.indexOf('router.get("/pdf", ctrl.pdf)') < routes.indexOf('router.get("/", ctrl.index)'));
    const app = read("src/app.js");
    assert.ok(app.includes('app.use("/api/laporan/pengupahan", laporanPengupahanRoutes)'));
    assert.ok(
      app.indexOf('app.use("/api/laporan/pengupahan"') < app.indexOf('app.use("/api/laporan", laporanRoutes)'),
      "mount pengupahan sebelum /api/laporan",
    );
    console.log("PASS rute /api/laporan/pengupahan/pdf dengan izin laporan:read atau laporan:st:read");
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
