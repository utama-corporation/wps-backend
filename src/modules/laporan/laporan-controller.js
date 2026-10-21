const { REPORT_BASE } = require("../../core/config/report");

/**
 * Menu Laporan (web) — semua laporan kategori Verifikasi memakai PDF dari
 * report microservice yang sama dengan aplikasi desktop (FrmLaporan → form
 * laporan terkait memanggil ApiReportURL). Mapping kode web → path microservice.
 */
const PDF_REPORTS = {
  "label-nyangkut": {
    path: "/label-nyangkut/pdf",
    params: [],
  },
  "rangkuman-bongkar-susun": {
    path: "/verifikasi/rangkuman-bongkar-susun/pdf",
    params: ["date"],
  },
  "bahan-yang-dihasilkan": {
    path: "/verifikasi/bahan-yang-dihasilkan/pdf",
    params: ["date"],
  },
  "bahan-terpakai": {
    path: "/bahan-terpakai/pdf",
    params: ["date"],
  },
  "cek-semua-produksi": {
    path: "/rangkuman-label-input/pdf",
    params: ["start_date", "end_date"],
  },
  "bagus-kulit-per-hari": {
    path: "/sawn-timber/total-bagus-kulit-rambung/pdf",
    params: ["TglSawmill"],
  },
  // --- Kategori Kayu Bulat (KB) — sama dengan form FrmLaporan "Kayu Bulat (KB)".
  "mutasi-kb": {
    path: "/mutasi-kayu-bulat/pdf",
    params: ["TglAwal", "TglAkhir"],
  },
  "mutasi-kb-gantung": {
    path: "/mutasi-kayu-bulat-v2/pdf",
    params: ["TglAwal", "TglAkhir"],
  },
  "saldo-kb": {
    path: "/kayu-bulat/saldo/pdf",
    params: ["TglAwal", "TglAkhir"],
  },
  "saldo-hidup-per-group": {
    path: "/kayu-bulat/hidup-per-group/pdf",
    params: [],
  },
  "rekap-pembelian-kb": {
    path: "/kayu-bulat/rekap-pembelian/pdf",
    params: [],
  },
  "kb-per-supplier-group": {
    path: "/kayu-bulat/penerimaan-per-supplier-group/pdf",
    params: ["start_date", "end_date"],
  },
  "kb-per-supplier-per-hari": {
    path: "/kayu-bulat/penerimaan-bulanan-per-supplier/pdf",
    params: ["start_date", "end_date"],
  },
  "opname-kb": {
    path: "/kayu-bulat/stock-opname/pdf",
    params: [],
  },
  "perbanding-kb-masuk": {
    path: "/kayu-bulat/perbandingan-kb-masuk-periode-1-dan-2/pdf",
    params: [
      "period_1_start_date",
      "period_1_end_date",
      "period_2_start_date",
      "period_2_end_date",
    ],
  },
  "timeline-kb-bulanan": {
    path: "/kayu-bulat/timeline-kayu-bulat-bulanan/pdf",
    params: ["start_date", "end_date"],
  },
  "timeline-kb-harian": {
    path: "/kayu-bulat/timeline-kayu-bulat-harian/pdf",
    params: ["start_date", "end_date"],
  },
  "kb-bangakang": {
    path: "/kayu-bulat/kb-khusus-bangkang/pdf",
    params: [],
  },
  "kb-hidup": {
    path: "/kayu-bulat/hidup/pdf",
    params: ["start_date", "end_date"],
  },
  "hasil-racip-hidup": {
    path: "/stock-racip-kayu-lat/pdf",
    params: [],
  },
  "hasil-output-racip-harian": {
    path: "/hasil-output-racip-harian/pdf",
    params: ["end_date"],
  },
  "balok-sudah-semprot": {
    path: "/kayu-bulat/balok-sudah-semprot/pdf",
    params: ["start_date", "end_date"],
  },
  "penerimaan-kb-grafik": {
    path: "/kayu-bulat/penerimaan-bulanan-per-supplier-grafik/pdf",
    params: ["start_date", "end_date"],
  },
  "mutasi-hasil-racip": {
    path: "/mutasi-hasil-racip/pdf",
    params: ["TglAwal", "TglAkhir"],
  },
  "mutasi-racip-detail": {
    path: "/mutasi-racip-detail/pdf",
    params: ["start_date", "end_date"],
  },
  "umur-kb": {
    path: "/kayu-bulat/umur-kayu-bulat-non-rambung/pdf",
    params: ["start_date", "end_date"],
  },
  // --- Kategori Kayu Bulat Rambung (KG) — form FrmLaporan "Kayu Bulat Rambung (KG)".
  "mutasi-kb-kg": {
    path: "/mutasi-kayu-bulat-kg/pdf",
    params: ["TglAwal", "TglAkhir"],
  },
  "mutasi-kb-kg-gantung": {
    path: "/mutasi-kayu-bulat-kgv2/pdf",
    params: ["TglAwal", "TglAkhir"],
  },
  "umur-kb-kg": {
    path: "/kayu-bulat/umur-kayu-bulat-rambung/pdf",
    params: ["start_date", "end_date"],
  },
  "rekap-penerimaan-st-kg": {
    path: "/kayu-bulat/rekap-penerimaan-st-dari-sawmill-kg/pdf",
    params: ["start_date", "end_date"],
  },
  "rekap-pembelian-kg": {
    path: "/kayu-bulat/rekap-pembelian-kg/pdf",
    params: [],
  },
  "kb-per-supplier-kg": {
    path: "/kayu-bulat/penerimaan-per-supplier-kg/pdf",
    params: ["start_date", "end_date"],
  },
  "saldo-hidup-kg": {
    path: "/kayu-bulat/saldo-hidup-kg/pdf",
    params: [],
  },
  "perbanding-kb-kg": {
    path: "/kayu-bulat/perbandingan-kb-masuk-periode-1-dan-2-kg/pdf",
    params: [
      "period_1_start_date",
      "period_1_end_date",
      "period_2_start_date",
      "period_2_end_date",
    ],
  },
  "timeline-kb-bulanan-kg": {
    path: "/kayu-bulat/timeline-kayu-bulat-bulanan-kg/pdf",
    params: ["start_date", "end_date"],
  },
  "timeline-kb-harian-kg": {
    path: "/kayu-bulat/timeline-kayu-bulat-harian-kg/pdf",
    params: ["start_date", "end_date"],
  },
  "produktivitas-sawmill-rp": {
    path: "/kayu-bulat/rekap-produktivitas-sawmill-rp/pdf",
    params: ["start_date", "end_date", "supplier"],
  },
  "supplier-intel": {
    path: "/kayu-bulat/supplier-intel/pdf",
    params: ["start_date", "end_date"],
  },
  "rendemen-rambung-supplier": {
    path: "/kayu-bulat/rekap-rendemen-rambung-per-supplier/pdf",
    params: ["start_date", "end_date"],
  },
  // --- Kategori Sawn Timber (ST) — form FrmLaporan "Sawn Timber (ST)".
  "rekap-hasil-sawmill-per-meja": {
    path: "/sawn-timber/rekap-hasil-sawmill-per-meja/pdf",
    params: ["start_date", "end_date"],
  },
  "st-sawmill-hari": {
    path: "/sawn-timber/st-sawmill-hari-tebal-lebar/pdf",
    params: ["start_date", "end_date"],
  },
  "rekap-hasil-sawmill": {
    path: "/sawn-timber/rekap-hasil-sawmill-per-meja-upah-borongan-v2/pdf",
    params: ["start_date", "end_date"],
  },
  "rekap-sawmill-meja-upah": {
    path: "/sawn-timber/rekap-hasil-sawmill-per-meja-upah-borongan/pdf",
    params: ["start_date", "end_date"],
  },
  "label-st-hidup": {
    // Catatan: tombol form memakai ".../pdf/async-wait" yang rawan 504;
    // path polos terbukti menghasilkan PDF yang sama (GET, ±58 dtk).
    path: "/sawn-timber/label-st-hidup-detail/pdf",
    params: [],
  },
  "mutasi-st": {
    path: "/mutasi-st/pdf",
    params: ["TglAwal", "TglAkhir"],
  },
  "rekap-st-penjualan": {
    path: "/sawn-timber/rekap-st-penjualan/pdf",
    params: ["start_date", "end_date"],
  },
  "dashboard-st": {
    path: "/dashboard-sawn-timber/pdf",
    params: ["start_date", "end_date"],
  },
  "rekap-penerimaan-st": {
    path: "/sawn-timber/rekap-penerimaan-st-dari-sawmill-non-rambung/pdf",
    params: ["start_date", "end_date"],
  },
  "rekap-produktivitas-sawmill": {
    path: "/sawn-timber/rekap-produktivitas-sawmill/pdf",
    params: ["start_date", "end_date"],
  },
  "vacuum-obat": {
    path: "/sawn-timber/pemakaian-obat-vacuum/pdf",
    params: ["start_date", "end_date"],
  },
  "umur-st": {
    path: "/sawn-timber/umur-sawn-timber-detail-ton/pdf",
    params: ["Umur1", "Umur2", "Umur3", "Umur4"],
  },
  "st-masuk-per-group": {
    path: "/sawn-timber/st-sawmill-masuk-per-group/pdf",
    params: ["start_date", "end_date"],
  },
  "st-sawmill-masuk-per-group": {
    path: "/sawn-timber/st-sawmill-masuk-per-group/pdf",
    params: ["start_date", "end_date"],
  },
  "st-basah-hidup-umur": {
    path: "/sawn-timber/st-basah-hidup-per-umur-kayu-ton/pdf",
    params: ["start_date", "end_date"],
  },
  "mutasi-kd": {
    path: "/sawn-timber/mutasi-kd/pdf",
    params: ["start_date", "end_date"],
  },
  "rekap-kd": {
    path: "/sawn-timber/rekap-kamar-kd/pdf",
    params: ["start_date", "end_date"],
  },
  "kd-keluar-masuk": {
    path: "/sawn-timber/kd-keluar-masuk/pdf",
    params: ["start_date", "end_date"],
  },
  "pembelian-st-supplier": {
    path: "/sawn-timber/pembelian-st-per-supplier-ton/pdf",
    params: ["start_date", "end_date"],
  },
  "pembelian-st-timeline": {
    path: "/sawn-timber/pembelian-st-timeline-ton/pdf",
    params: ["start_date", "end_date"],
  },
  "rambung-mc1-mc2": {
    path: "/sawn-timber/st-rambung-mc1-mc2-detail/pdf",
    params: [],
  },
  "stock-st-kering": {
    path: "/sawn-timber/stock-st-kering/pdf",
    params: ["end_date"],
  },
  "stock-st-basah": {
    path: "/sawn-timber/stock-st-basah/pdf",
    params: ["end_date"],
  },
  "ketahanan-barang-st": {
    path: "/sawn-timber/ketahanan-barang-st/pdf",
    params: ["start_date", "end_date"],
  },
  "st-hidup-kering": {
    path: "/sawn-timber/st-hidup-kering/pdf",
    params: ["hari", "include", "exclude"],
  },
  "output-s4s-grade": {
    path: "/s4s/output-produksi-s4s-per-grade/pdf",
    params: ["start_date", "end_date"],
  },
  "mutasi-s4s": {
    path: "/mutasi-s4s/pdf",
    params: ["TglAwal", "TglAkhir"],
  },
  "umur-s4s": {
    path: "/s4s/umur-s4s-detail/pdf",
    params: ["Umur1", "Umur2", "Umur3", "Umur4"],
  },
  "rekap-produksi-s4s": {
    path: "/s4s/rekap-produksi-s4s-consolidated/pdf",
    params: ["start_date", "end_date"],
  },
  "label-s4s-hidup": {
    path: "/s4s/s4s-hidup-detail/pdf",
    params: [],
  },
  "label-s4s-jenis": {
    path: "/s4s/label-s4s-hidup-per-jenis-kayu/pdf",
    params: [],
  },
  "label-s4s-produk": {
    path: "/s4s/label-s4s-hidup-per-produk-per-jenis-kayu/pdf",
    params: [],
  },
  "rekap-s4s-jenis": {
    path: "/s4s/rekap-produksi-s4s-per-jenis-per-grade/pdf",
    params: ["start_date", "end_date"],
  },
  "ketahanan-s4s": {
    path: "/s4s/ketahanan-barang-s4s/pdf",
    params: ["start_date", "end_date"],
  },
  "grade-abc-harian": {
    path: "/s4s/grade-abc-harian/pdf",
    params: ["start_date", "end_date"],
  },
  "dashboard-s4s": {
    path: "/dashboard-s4s/pdf",
    params: ["start_date", "end_date"],
  },
  "dashboard-s4s-v2": {
    path: "/dashboard-s4s-v2/pdf",
    params: ["start_date", "end_date"],
  },
  "s4s-rambung-grade": {
    path: "/s4s/rekap-produksi-rambung-per-grade/pdf",
    params: ["start_date", "end_date"],
  },
  "mutasi-fj": {
    path: "/mutasi-finger-joint/pdf",
    params: ["TglAwal", "TglAkhir"],
  },
  "umur-fj": {
    path: "/finger-joint/umur-finger-joint-detail/pdf",
    params: ["Umur1", "Umur2", "Umur3", "Umur4"],
  },
  "rekap-produksi-fj": {
    path: "/finger-joint/rekap-produksi-finger-joint-consolidated/pdf",
    params: ["start_date", "end_date"],
  },
  "label-fj": {
    path: "/finger-joint/finger-joint-hidup-detail/pdf",
    params: [],
  },
  "rekap-fj-jenis": {
    path: "/finger-joint/rekap-produksi-finger-joint-per-jenis-per-grade/pdf",
    params: ["start_date", "end_date"],
  },
  "ketahanan-fj": {
    path: "/finger-joint/ketahanan-barang-finger-joint/pdf",
    params: ["start_date", "end_date"],
  },
  "dashboard-fj": {
    path: "/dashboard-finger-joint/pdf",
    params: ["start_date", "end_date"],
  },
  "mutasi-moulding": {
    path: "/mutasi-moulding/pdf",
    params: ["TglAwal", "TglAkhir"],
  },
  "umur-moulding": {
    path: "/moulding/umur-moulding-detail/pdf",
    params: ["Umur1", "Umur2", "Umur3", "Umur4"],
  },
  "rekap-produksi-moulding": {
    path: "/moulding/rekap-produksi-moulding-consolidated/pdf",
    params: ["start_date", "end_date"],
  },
  "label-moulding": {
    path: "/moulding/moulding-hidup-detail/pdf",
    params: [],
  },
  "rekap-moulding-jenis": {
    path: "/moulding/rekap-produksi-moulding-per-jenis-per-grade/pdf",
    params: ["start_date", "end_date"],
  },
  "ketahanan-moulding": {
    path: "/moulding/ketahanan-barang-moulding/pdf",
    params: ["start_date", "end_date"],
  },
  "dashboard-moulding": {
    path: "/dashboard-moulding/pdf",
    params: ["start_date", "end_date"],
  },
  "mutasi-laminating": {
    path: "/mutasi-laminating/pdf",
    params: ["TglAwal", "TglAkhir"],
  },
  "umur-laminating": {
    path: "/laminating/umur-laminating-detail/pdf",
    params: ["Umur1", "Umur2", "Umur3", "Umur4"],
  },
  "rekap-produksi-laminating": {
    path: "/laminating/rekap-produksi-laminating-consolidated/pdf",
    params: ["start_date", "end_date"],
  },
  "label-laminating": {
    path: "/laminating/laminating-hidup-detail/pdf",
    params: [],
  },
  "rekap-laminating-jenis": {
    path: "/laminating/rekap-produksi-laminating-per-jenis-per-grade/pdf",
    params: ["start_date", "end_date"],
  },
  "ketahanan-laminating": {
    path: "/laminating/ketahanan-barang-laminating/pdf",
    params: ["start_date", "end_date"],
  },
  "dashboard-laminating": {
    path: "/dashboard-laminating/pdf",
    params: ["start_date", "end_date"],
  },
  "mutasi-cca": {
    path: "/mutasi-cca-akhir/pdf",
    params: ["TglAwal", "TglAkhir"],
  },
  "umur-cca": {
    path: "/cross-cut-akhir/umur-cc-akhir-detail/pdf",
    params: ["Umur1", "Umur2", "Umur3", "Umur4"],
  },
  "rekap-produksi-cca": {
    path: "/cross-cut-akhir/rekap-produksi-cc-akhir-consolidated/pdf",
    params: ["start_date", "end_date"],
  },
  "label-cca": {
    path: "/cross-cut-akhir/cc-akhir-hidup-detail/pdf",
    params: [],
  },
  "rekap-cca-jenis": {
    path: "/cross-cut-akhir/rekap-produksi-cc-akhir-per-jenis-per-grade/pdf",
    params: ["start_date", "end_date"],
  },
  "ketahanan-cca": {
    path: "/cross-cut-akhir/ketahanan-barang-cc-akhir/pdf",
    params: ["start_date", "end_date"],
  },
  "dashboard-cca": {
    path: "/dashboard-cross-cut-akhir/pdf",
    params: ["start_date", "end_date"],
  },
  "mutasi-sanding": {
    path: "/mutasi-sanding/pdf",
    params: ["TglAwal", "TglAkhir"],
  },
  "umur-sanding": {
    path: "/sanding/umur-sanding-detail/pdf",
    params: ["Umur1", "Umur2", "Umur3", "Umur4"],
  },
  "rekap-produksi-sanding": {
    path: "/sanding/rekap-produksi-sanding-consolidated/pdf",
    params: ["start_date", "end_date"],
  },
  "label-sanding": {
    path: "/sanding/sanding-hidup-detail/pdf",
    params: [],
  },
  "rekap-sanding-jenis": {
    path: "/sanding/rekap-produksi-sanding-per-jenis-per-grade/pdf",
    params: ["start_date", "end_date"],
  },
  "ketahanan-sanding": {
    path: "/sanding/ketahanan-barang-sanding/pdf",
    params: ["start_date", "end_date"],
  },
  "dashboard-sanding": {
    path: "/dashboard-sanding/pdf",
    params: ["start_date", "end_date"],
  },
  "mutasi-reproses": {
    path: "/mutasi-reproses/pdf",
    params: ["TglAwal", "TglAkhir"],
  },
  "mutasi-bj": {
    path: "/mutasi-barang-jadi/pdf",
    params: ["TglAwal", "TglAkhir"],
  },
  "mutasi-bj-jenis": {
    path: "/barang-jadi/mutasi-barang-jadi-per-jenis-per-ukuran/pdf",
    params: ["start_date", "end_date"],
  },
  "label-bj": {
    path: "/barang-jadi/barang-jadi-hidup-detail/pdf",
    params: [],
  },
  "umur-bj": {
    path: "/barang-jadi/umur-barang-jadi-detail/pdf",
    params: ["Umur1", "Umur2", "Umur3", "Umur4"],
  },
  "rekap-produksi-bj": {
    path: "/barang-jadi/rekap-produksi-barang-jadi-consolidated/pdf",
    params: ["start_date", "end_date"],
  },
  "rekap-bj-jenis": {
    path: "/barang-jadi/rekap-produksi-packing-per-jenis-per-grade/pdf",
    params: ["start_date", "end_date"],
  },
  "dashboard-bj": {
    path: "/dashboard-barang-jadi/pdf",
    params: ["start_date", "end_date"],
  },
  "rendemen-non-rambung": {
    path: "/rendemen-kayu/rekap-rendemen-non-rambung/pdf",
    params: ["year", "month"],
  },
  "produksi-per-spk": {
    path: "/rendemen-kayu/produksi-per-spk/pdf",
    params: ["NoSPK"],
  },
  "penjualan-lokal": {
    path: "/kayu-bulat/balok-sudah-semprot/pdf",
    params: ["start_date", "end_date"],
  },
  "rekap-semua-mesin": {
    path: "/management/produksi-semua-mesin/pdf",
    params: ["start_date", "end_date"],
  },
  "rekap-semua-mesin-rend": {
    path: "/management/produksi-hulu-hilir/pdf",
    params: ["start_date", "end_date"],
  },
  "lembur-per-mesin": {
    path: "/management/hasil-produksi-mesin-lembur-dan-non-lembur/pdf",
    params: ["start_date", "end_date"],
  },
  "rekap-mutasi": {
    path: "/management/rekap-mutasi/pdf",
    params: ["start_date", "end_date"],
  },
  "rekap-mutasi-v2": {
    path: "/management/rekap-mutasi-cross-tab/pdf",
    params: ["start_date", "end_date"],
  },
  "rekap-mutasi-v2-spk": {
    path: "/management/discrepancy-rekap-mutasi/pdf",
    params: ["start_date", "end_date"],
  },
  "flow-produksi": {
    path: "/management/flow-produksi-per-periode/pdf",
    params: ["start_date", "end_date"],
  },
  "label-perhari": {
    path: "/management/label-perhari/pdf",
    params: ["start_date", "end_date"],
  },
  "stock-hidup-per-spk": {
    path: "/management/stock-hidup-per-nospk/pdf",
    params: ["date"],
  },
  "stock-hidup-deskripsi": {
    path: "/management/stock-hidup-per-nospk-discrepancy/pdf",
    params: ["date"],
  },
  "dashboard-ru": {
    path: "/management/dashboard-ru/pdf",
    params: ["periode"],
  },
};

exports.getPdf = async (req, res) => {
  try {
    const spec = PDF_REPORTS[req.params.kode];
    if (!spec) {
      return res.status(404).json({ success: false, message: "Laporan tidak ditemukan" });
    }

    const qs = new URLSearchParams();
    for (const p of spec.params) {
      const v = req.query[p];
      if (v !== undefined && v !== "") qs.set(p, String(v));
    }
    const query = qs.toString();
    const upstreamUrl = `${REPORT_BASE}/api/reports${spec.path}${query ? `?${query}` : ""}`;
    const auth = { Authorization: req.headers.authorization || "", Accept: "application/pdf" };

    let upstream = await fetch(upstreamUrl, { headers: auth });
    // Sebagian route microservice hanya menerima POST (atau sebaliknya) —
    // coba method lain sekali kalau menolak method.
    if (upstream.status === 405) {
      upstream = await fetch(upstreamUrl, { method: "POST", headers: auth });
    }
    if (!upstream.ok) {
      let message = `Gagal membuat laporan (${upstream.status})`;
      try {
        const body = await upstream.json();
        message = body.message || body.Message || message;
      } catch {
        // body bukan JSON — pakai pesan default
      }
      return res
        .status(upstream.status === 404 || upstream.status === 422 ? upstream.status : 502)
        .json({ success: false, message });
    }

    const pdf = Buffer.from(await upstream.arrayBuffer());
    const file = `laporan-${req.params.kode}.pdf`.replace(/[^\w.-]/g, "_");
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file}"`,
      "Content-Length": pdf.length,
    });
    res.end(pdf);
  } catch (err) {
    console.error("Error laporan PDF:", err);
    res.status(500).json({ success: false, message: "Gagal membuat laporan" });
  }
};
