const lembarTallyHasilSawmillService = require("./lembar-tally-hasil-sawmill-service");

// Cetak memakai report microservice yang sama dengan tablet (Sawmill.java), bukan laporan buatan sendiri.
// Tablet: "http://192.168.10.100:5006/api/reports/sawn-timber/lembar-tally-hasil-sawmill/pdf?no_produksi=...".
// Override host via REPORT_MICROSERVICE_URL (mis. "http://192.168.10.100:5006").
const REPORT_BASE = (process.env.REPORT_MICROSERVICE_URL || `http://${process.env.DB_SERVER}:5006`).replace(/\/+$/, "");

exports.getMasters = async (_req, res) => {
  try {
    const data = await lembarTallyHasilSawmillService.getMasters();
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error get masters:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getKayuBulat = async (req, res) => {
  try {
    const data = await lembarTallyHasilSawmillService.getKayuBulat(req.query.no);
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error get kayu bulat:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getOperatorMeja = async (req, res) => {
  try {
    const data = await lembarTallyHasilSawmillService.getOperatorMeja(req.query.noMeja);
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error get operator meja:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getProdukSPK = async (req, res) => {
  try {
    const data = await lembarTallyHasilSawmillService.getProdukSPK(req.query.noSPK);
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error get produk spk:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getMeja = async (_req, res) => {
  try {
    const data = await lembarTallyHasilSawmillService.getMeja();
    res.json({ success: true, data, total: data.length });
  } catch (err) {
    console.error("Error get meja:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getRiwayat = async (req, res) => {
  try {
    const data = await lembarTallyHasilSawmillService.getRiwayat({
      noMeja: req.query.noMeja || "",
      top: req.query.top || 40,
      search: req.query.search || "",
    });
    res.json({ success: true, data, total: data.length });
  } catch (err) {
    console.error("Error get riwayat:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const data = await lembarTallyHasilSawmillService.getAll({
      cari: req.query.cari || "",
      top: req.query.top || 100,
      tanggal: req.query.tanggal || "",
      noMeja: req.query.noMeja || "",
    });
    res.json({ success: true, data, total: data.length });
  } catch (err) {
    console.error("Error get all:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getByNo = async (req, res) => {
  try {
    const data = await lembarTallyHasilSawmillService.getByNo(req.query.no);
    if (!data) return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error get by no:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const no = await lembarTallyHasilSawmillService.create(req.body);
    res.status(201).json({ success: true, message: "Data berhasil disimpan", data: { no } });
  } catch (err) {
    console.error("Error create:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const updated = await lembarTallyHasilSawmillService.update(req.body);
    if (!updated) return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    res.json({ success: true, message: "Data berhasil diubah" });
  } catch (err) {
    console.error("Error update:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const deleted = await lembarTallyHasilSawmillService.remove(req.query.no);
    if (!deleted) return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    res.json({ success: true, message: "Data berhasil dihapus" });
  } catch (err) {
    console.error("Error delete:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getSpkByTebalLebar = async (req, res) => {
  try {
    const tebal = parseFloat(req.query.tebal);
    const lebar = parseFloat(req.query.lebar);
    if (isNaN(tebal) || isNaN(lebar)) {
      return res.status(400).json({ success: false, message: "tebal dan lebar harus angka" });
    }
    const data = await lembarTallyHasilSawmillService.getSpkByTebalLebar(tebal, lebar);
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error get spk by tebal lebar:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateHeader = async (req, res) => {
  try {
    const updated = await lembarTallyHasilSawmillService.updateHeader(req.body);
    if (!updated) return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    res.json({ success: true, message: "Header berhasil diubah" });
  } catch (err) {
    console.error("Error update header:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.selesai = async (req, res) => {
  try {
    const no = req.query.no || req.body.no;
    const username = req.body.username || req.query.username || "";
    const result = await lembarTallyHasilSawmillService.selesai(no, username);
    res.json({ success: true, message: "Penerimaan ST Sawmill berhasil disimpan", data: result });
  } catch (err) {
    console.error("Error selesai:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /laporan?no=D.000000 → PDF Lembar Tally Hasil Sawmill (inline).
exports.getLaporan = async (req, res) => {
  try {
    const no = req.query.no;
    if (!no) return res.status(400).json({ success: false, message: "Nomor tally wajib diisi" });

    // Microservice memvalidasi JWT yang sama (tablet mengirim Bearer token login).
    const upstream = await fetch(
      `${REPORT_BASE}/api/reports/sawn-timber/lembar-tally-hasil-sawmill/pdf?no_produksi=${encodeURIComponent(no)}`,
      { headers: { Authorization: req.headers.authorization || "", Accept: "application/pdf" } },
    );
    if (!upstream.ok) {
      let message = `Gagal membuat laporan (${upstream.status})`;
      try {
        const body = await upstream.json();
        message = body.message || body.Message || message;
      } catch {
        // body bukan JSON — pakai pesan default
      }
      return res.status(upstream.status === 404 || upstream.status === 422 ? upstream.status : 502).json({ success: false, message });
    }
    const pdf = Buffer.from(await upstream.arrayBuffer());
    const file = `lembar-tally-hasil-sawmill-${no}.pdf`.replace(/[^\w.-]/g, "_");
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file}"`,
      "Content-Length": pdf.length,
    });
    res.end(pdf);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error("Error laporan tally:", err);
    res.status(status).json({ success: false, message: status === 500 ? "Gagal membuat laporan" : err.message });
  }
};
