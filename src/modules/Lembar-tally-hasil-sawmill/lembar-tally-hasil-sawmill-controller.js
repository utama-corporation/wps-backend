const lembarTallyHasilSawmillService = require("./lembar-tally-hasil-sawmill-service");

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