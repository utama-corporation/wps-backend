const penKayuBulatService = require("./pen-kayu-bulat-service");
const penKayuBulatReport = require("./pen-kayu-bulat-report");

exports.getNextNo = async (_req, res) => {
  try {
    const no = await penKayuBulatService.getNextNo();
    res.json({ success: true, data: { no_kayu_bulat: no } });
  } catch (err) {
    console.error("Error get next no:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getMasters = async (_req, res) => {
  try {
    const data = await penKayuBulatService.getMasters();
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error get masters:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const data = await penKayuBulatService.getAll({ cari: req.query.cari || "", status: req.query.status || "" });
    res.json({ success: true, data, total: data.length });
  } catch (err) {
    console.error("Error get all:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getHeader = async (req, res) => {
  try {
    const data = await penKayuBulatService.getHeader(req.query.no);
    if (!data) return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error get header:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getDetail = async (req, res) => {
  try {
    const data = await penKayuBulatService.getDetail({
      no: req.query.no,
      mode: req.query.mode || "TON",
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error get detail:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const noKayuBulat = await penKayuBulatService.create(req.body);
    res.status(201).json({ success: true, message: "Data berhasil ditambahkan", data: { noKayuBulat } });
  } catch (err) {
    console.error("Error create:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const updated = await penKayuBulatService.update(req.body);
    if (!updated) return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    res.json({ success: true, message: "Data berhasil diperbarui" });
  } catch (err) {
    console.error("Error update:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const deleted = await penKayuBulatService.remove(req.query.no);
    if (!deleted) return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    res.json({ success: true, message: "Data berhasil dihapus" });
  } catch (err) {
    console.error("Error delete:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /laporan?jenis=int-ton|ext-ton|int-kg|ext-kg&no=A.000000 → PDF inline.
exports.getLaporan = async (req, res) => {
  try {
    const { jenis, no } = req.query;
    const pdf = await penKayuBulatReport.generatePdf(jenis, no, req.username);
    const file = `penerimaan-kayu-bulat-${jenis}-${no}.pdf`.replace(/[^\w.-]/g, "_");
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file}"`,
      "Content-Length": pdf.length,
    });
    res.end(pdf);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error('Error laporan:', err);
    res.status(status).json({ success: false, message: status === 500 ? 'Gagal membuat laporan' : err.message });
  }
};
