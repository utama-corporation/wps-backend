// Tes Tarif Upah Stick tanpa database: aturan bundle pendek/panjang, tebal tunggal,
// upah = tarif x jumlah tingkat per Label ST, validasi master, dan pemasangan rute.
const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const plain = (v) => JSON.parse(JSON.stringify(v));

// db asli membuka koneksi saat di-require; ganti dengan tiruan.
const dbPath = path.join(root, "src/core/config/db.js");
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: {}, poolPromise: new Promise(() => {}) } };

const upah = require(path.join(root, "src/modules/label/st/upah-stick.js"));
const master = require(path.join(root, "src/modules/master-tarif-upah-stick/master-tarif-upah-stick-service.js"));

// Detail label ST; satuan tebal & panjang ada di header label.
const row = (Tebal, Panjang, JmlhBatang) => ({ Tebal, Panjang, JmlhBatang });
const MM = 1, INCH = 3, FEET = 4;
const analisa = (rows, uomTebal = MM, uomPanjang = FEET) => upah.analisaDetail(rows, uomTebal, uomPanjang);
const KOSONG = { jenisBundle: null, tarif: null, upah: null, keterangan: null };

// Bundle PANJANG bila batang >= 4 ft mencapai >= 10% batang < 4 ft, selain itu PENDEK.
{
  // Label uji user E.518709: 66 batang panjang dari 89 batang pendek -> 74,16%.
  const e = analisa([row(44, 1, 20), row(44, 2, 52), row(44, 2.5, 17), row(44, 4, 66)]);
  assert.equal(e.persenPanjang, 74.16);
  assert.equal(e.jenisBundle, "PANJANG");
  assert.equal(e.tebalMm, 44);
  assert.equal(e.keterangan, null);
  // Tepat 10% dari batang pendek: 2 dari 20 -> PANJANG (>= 10%).
  const pas = analisa([row(44, 5, 2), row(44, 2, 20)]);
  assert.equal(pas.persenPanjang, 10);
  assert.equal(pas.jenisBundle, "PANJANG");
  // Di bawah 10%: 2 dari 21 -> PENDEK.
  const kurang = analisa([row(44, 4, 2), row(44, 2, 21)]);
  assert.equal(kurang.persenPanjang, 9.52);
  assert.equal(kurang.jenisBundle, "PENDEK");
  // Semua di bawah 4 ft -> PENDEK, 0%.
  assert.equal(analisa([row(44, 3.5, 10), row(44, 1, 3)]).jenisBundle, "PENDEK");
  assert.equal(analisa([row(44, 3.5, 10)]).persenPanjang, 0);
  // Tepat 4 ft ikut dihitung panjang: 3 dari 36 = 8,33% -> PENDEK.
  const batas = analisa([row(44, 4, 3), row(44, 3, 36)]);
  assert.equal(batas.persenPanjang, 8.33);
  assert.equal(batas.jenisBundle, "PENDEK");
  // Tanpa batang pendek: semua panjang -> PANJANG, persen null.
  const semuaPanjang = analisa([row(44, 5, 2)]);
  assert.equal(semuaPanjang.persenPanjang, null);
  assert.equal(semuaPanjang.jenisBundle, "PANJANG");
  // Yang dihitung batang, bukan feet: 9 x 4 ft dari 100 x 1 ft = 9% PENDEK,
  // sedangkan 10 x 4 ft dari 100 x 3,9 ft = 10% PANJANG.
  assert.equal(analisa([row(44, 4, 9), row(44, 1, 100)]).jenisBundle, "PENDEK");
  assert.equal(analisa([row(44, 4, 10), row(44, 3.9, 100)]).jenisBundle, "PANJANG");
  // Pembagi = batang < 4 ft (keputusan user): 10 dari 95 = 10,53% -> PANJANG,
  // walau terhadap total batang (10/105) hanya 9,5%.
  const contohUser = analisa([row(44, 4, 10), row(44, 2, 95)]);
  assert.equal(contohUser.persenPanjang, 10.53);
  assert.equal(contohUser.jenisBundle, "PANJANG");
  console.log("PASS bundle: >= 10% batang >= 4 ft vs batang < 4 ft = PANJANG, batas 10% & 4 ft");
}

// Tebal: harus satu; inch dikonversi ke mm; satuan panjang label harus feet.
{
  const multi = analisa([row(44, 8, 2), row(50, 8, 2)]);
  assert.equal(multi.tebalMm, null);
  assert.equal(multi.keterangan, "Tebal lebih dari satu (44, 50 mm)");
  assert.equal(analisa([row(2, 8, 2), row(2, 10, 2)], INCH).tebalMm, 50.8, "2 inch = 50.8 mm");
  const bukanFeet = analisa([row(44, 2.4, 10)], MM, 5);
  assert.equal(bukanFeet.jenisBundle, null);
  assert.equal(bukanFeet.keterangan, "Satuan panjang label bukan feet");
  assert.equal(analisa([]).keterangan, "Detail label belum diisi");
  assert.equal(analisa([row(0, 8, 2)]).keterangan, "Tebal belum diisi");
  assert.equal(analisa([row(44, 8, 0), row(50, 3, 0), row(44, 9, 1)]).tebalMm, 44, "pcs 0 diabaikan");
  console.log("PASS tebal: tunggal, inch->mm, bukan feet, detail kosong");
}

// Upah = tarif (sesuai bundle) x jumlah tingkat; tanpa tingkat = tanpa upah.
{
  const tarif = { TarifBundlePendek: 1500, TarifBundlePanjang: 1200.5 };
  const pendek = analisa([row(44, 3, 4), row(44, 2, 10)]);
  assert.deepEqual(plain(upah.hitungUpah(pendek, tarif, 3)), { jenisBundle: "PENDEK", tarif: 1500, upah: 4500, keterangan: null });
  const panjang = analisa([row(44, 10, 10)]);
  assert.equal(upah.hitungUpah(panjang, tarif, 2).upah, 2401);
  // Tarif uji user RAMBUNG - STD 44 mm: Pendek 819, Panjang 910; E.518709 = 11 tingkat.
  const e = analisa([row(44, 1, 20), row(44, 2, 52), row(44, 2.5, 17), row(44, 4, 66)]);
  assert.deepEqual(plain(upah.hitungUpah(e, { TarifBundlePendek: 819, TarifBundlePanjang: 910 }, 11)), {
    jenisBundle: "PANJANG",
    tarif: 910,
    upah: 10010,
    keterangan: null,
  });
  // Label yang bukan label stick (tingkat kosong) tidak mendapat kolom hasil apa pun.
  assert.deepEqual(plain(upah.hitungUpah(panjang, tarif, null)), KOSONG);
  assert.deepEqual(plain(upah.hitungUpah(analisa([]), null, null)), KOSONG);
  const tanpaTarif = upah.hitungUpah(panjang, null, 3);
  assert.equal(tanpaTarif.keterangan, "Tarif belum diatur untuk tebal 44 mm");
  assert.equal(tanpaTarif.jenisBundle, "PANJANG");
  assert.equal(tanpaTarif.upah, null);
  const denganKonteks = upah.hitungUpah(panjang, null, 3, {
    idJenisKayu: 5,
    tanggal: "2026-11-01",
  });
  assert.match(denganKonteks.keterangan, /Tarif belum diatur untuk tebal 44 mm, IdJenisKayu 5, tgl 2026-11-01/);
  const multi = upah.hitungUpah(analisa([row(44, 8, 2), row(50, 8, 2)]), tarif, 3);
  assert.equal(multi.upah, null);
  assert.match(multi.keterangan, /Tebal lebih dari satu/);
  console.log("PASS upah: tarif x tingkat, tanpa tingkat, tanpa tarif, tebal ganda");
}

// DateCreate dari DB (Date) dan dari form (string) harus sama.
{
  assert.equal(upah.tanggalIso(new Date("2026-06-13T00:00:00.000Z")), "2026-06-13");
  assert.equal(upah.tanggalIso("2026-06-13"), "2026-06-13");
  assert.equal(upah.tanggalIso("Sat Jun 13 2026 00:00:00 GMT+0700"), "2026-06-13");
  assert.equal(upah.tanggalIso("2026-06-13T08:30:00"), "2026-06-13");
  assert.equal(upah.tanggalIso(null), null);
  const dariDb = upah.hitungUpah(analisa([row(44, 4, 10)]), null, 2, {
    idJenisKayu: 5,
    tanggal: new Date("2026-06-13T00:00:00.000Z"),
  });
  assert.match(dariDb.keterangan, /tgl 2026-06-13/);
  console.log("PASS tanggal: Date dari DB tidak lagi jadi 'Sat Jun 13'");
}

// Jumlah tingkat dari client (payload Label ST camelCase).
{
  assert.equal(upah.parseJumlahTingkat({}), undefined, "tidak dikirim = biarkan");
  assert.equal(upah.parseJumlahTingkat({ jumlahTingkat: "" }), null);
  assert.equal(upah.parseJumlahTingkat({ jumlahTingkat: null }), null);
  assert.equal(upah.parseJumlahTingkat({ jumlahTingkat: "4" }), 4);
  for (const bad of [0, -1, 2.5, "abc", 1000]) {
    assert.throws(() => upah.parseJumlahTingkat({ jumlahTingkat: bad }), (e) => e.statusCode === 400);
  }
  console.log("PASS jumlah tingkat: kosong, angka, ditolak bila tidak valid");
}

// Validasi master.
{
  const ok = { idJenisKayu: 3, tebal: "45,5", tarifBundlePendek: 1500, tarifBundlePanjang: 0, berlakuMulai: "2026-12-01" };
  assert.deepEqual(plain(master.validate(ok)), { idJenisKayu: 3, tebal: 45.5, tarifBundlePendek: 1500, tarifBundlePanjang: 0, berlakuMulai: "2026-12-01", enable: true });
  assert.equal(master.validate({ ...ok, enable: false }).enable, false);
  const bad = [
    { idJenisKayu: "" },
    { tebal: 0 },
    { tebal: "" },
    { tebal: "abc" },
    { tarifBundlePendek: -1 },
    { tarifBundlePanjang: "" },
    { berlakuMulai: "2026-02-30" },
    { berlakuMulai: "" },
  ];
  for (const b of bad) assert.throws(() => master.validate({ ...ok, ...b }), (e) => e.status === 400, JSON.stringify(b));
  console.log("PASS validasi master: tebal, tarif, tanggal, jenis kayu");
}

// Rute, izin, migrasi, dan pemanggilan di Label ST (bukan Lembar Telly).
{
  const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
  const routes = read("src/modules/master-tarif-upah-stick/master-tarif-upah-stick-routes.js");
  for (const p of ["read", "create", "update", "delete"]) assert.ok(routes.includes(`datamaster_tarifupahstick:${p}`));
  assert.ok(routes.indexOf('"/jenis-kayu-options"') < routes.indexOf('"/:id"'));
  assert.ok(read("src/app.js").includes('app.use("/api/master/tarif-upah-stick", masterTarifUpahStickRoutes)'));

  const svc = read("src/modules/label/st/label-st-service.js");
  const create = svc.slice(svc.indexOf("async function createLabel"));
  assert.ok(create.indexOf("parseJumlahTingkat(data)") < create.indexOf("transaction.begin()"), "create: validasi sebelum transaksi");
  assert.ok(create.indexOf("simpanUpahStick(transaction, noST, jumlahTingkat)") < create.indexOf("transaction.commit()"), "create: satu transaksi");
  assert.equal(svc.split("await upahStick.bacaUpahStick(noST)").length - 1, 2, "getHeader & getHeaderForEdit");

  const ctrl = read("src/modules/label/st/label-st-controller.js");
  const upd = ctrl.slice(ctrl.indexOf("exports.updateLabel"), ctrl.indexOf("exports.deleteLabel"));
  assert.ok(upd.indexOf("parseJumlahTingkat") < upd.indexOf("labelStService.updateLabel("), "update: validasi sebelum menulis");
  assert.ok(upd.indexOf("hitungUlangUpahStick") > upd.indexOf("replaceBongkarSusun"), "update: hitung setelah detail tersimpan");

  const tally = read("src/modules/Lembar-tally-hasil-sawmill/lembar-tally-hasil-sawmill-service.js");
  assert.ok(!/upahstick|jumlah_tingkat|JumlahTingkat/i.test(tally), "Lembar Telly tidak lagi menghitung upah");
  assert.ok(!fs.existsSync(path.join(root, "src/modules/Lembar-tally-hasil-sawmill/upah-stick.js")));

  const mig = read("db/migrations/sql/V6__tarif_upah_stick.sql");
  assert.ok(/Tebal\s+DECIMAL/.test(mig) && !mig.includes("TebalDari"), "satu kolom tebal");
  assert.ok(mig.includes("UX_MstTarifUpahStick_Aktif"), "unik per jenis + tebal + tanggal");
  assert.ok(mig.includes("N'dbo.ST_h', N'UpahStick'") && !mig.includes("STSawmill_h"), "kolom di ST_h, bukan STSawmill_h");
  for (const c of ["MstTarifUpahStick", "JumlahTingkat", "JenisBundleStick", "TarifUpahStick", "UpahStick", "KeteranganUpahStick"]) assert.ok(mig.includes(c));
  console.log("PASS rute, izin, migrasi ST_h, dan Label ST memanggil hitung upah");
}

// Preview upah boleh untuk pemegang izin buat ATAU ubah label (form ubah juga memakai preview).
{
  const routes = fs.readFileSync(path.join(root, "src/modules/label/st/label-st-routes.js"), "utf8");
  const blok = routes.slice(routes.indexOf('"/label/st/preview-upah"'), routes.indexOf("ctrl.previewUpah"));
  assert.ok(blok.includes('"label_st:create"') && blok.includes('"label_st:update"'), "create ATAU update");
  assert.ok(!blok.includes("requirePermission("), "bukan requirePermission (yang mewajibkan semua izin)");
  console.log("PASS preview upah: izin buat atau ubah label");
}
