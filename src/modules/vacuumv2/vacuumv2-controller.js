const vacuumV2Service = require("./vacuumv2-service");

exports.getMasters = async (req, res) => {
  try {
    const data = await vacuumV2Service.getMasters();
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error get masters:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const data = await vacuumV2Service.getAll({ cari: req.query.cari || "" });
    res.json({ success: true, data, total: data.length });
  } catch (err) {
    console.error("Error get all:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getHeader = async (req, res) => {
  try {
    const data = await vacuumV2Service.getHeader(req.query.no);
    if (!data) return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error get header:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getDetail = async (req, res) => {
  try {
    const data = await vacuumV2Service.getDetail(req.query.no);
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error get detail:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const no = await vacuumV2Service.create(req.body);
    res.status(201).json({ success: true, message: "Data berhasil ditambahkan", data: { no } });
  } catch (err) {
    console.error("Error create:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const updated = await vacuumV2Service.update(req.body);
    if (!updated) return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    res.json({ success: true, message: "Data berhasil diperbarui" });
  } catch (err) {
    console.error("Error update:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const deleted = await vacuumV2Service.remove(req.query.no, req.query.nip);
    if (!deleted) return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    res.json({ success: true, message: "Data berhasil dihapus" });
  } catch (err) {
    console.error("Error delete:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};