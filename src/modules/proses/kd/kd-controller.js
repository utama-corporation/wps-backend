const kdService = require("./kd-service");

exports.getRooms = async (req, res) => {
  try {
    const noRuang = req.query.no ? parseInt(req.query.no) : null;
    const data = await kdService.getRooms(noRuang);
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error getRooms:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getMasters = async (req, res) => {
  try {
    const data = await kdService.getMasters();
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error getMasters:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.cariST = async (req, res) => {
  try {
    const cari = req.query.cari || "";
    const data = await kdService.cariST(cari);
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error cariST:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getHeader = async (req, res) => {
  try {
    const noProcKD = req.query.no || "";
    const data = await kdService.getHeader(noProcKD);
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error getHeader:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getDetail = async (req, res) => {
  try {
    const noProcKD = req.query.no || "";
    const data = await kdService.getDetail(noProcKD);
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error getDetail:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.startRoom = async (req, res) => {
  try {
    const { no_ruang, nip } = req.body;
    const data = await kdService.startRoom(no_ruang, nip);
    res.json({ success: true, message: "Kamar berhasil dijalankan", data });
  } catch (err) {
    console.error("Error startRoom:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.stopRoom = async (req, res) => {
  try {
    const { no_ruang, nip } = req.body;
    const data = await kdService.stopRoom(no_ruang, nip);
    res.json({ success: true, message: "Kamar berhasil dihentikan", data });
  } catch (err) {
    console.error("Error stopRoom:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createHeader = async (req, res) => {
  try {
    const data = await kdService.createHeader(req.body);
    res.status(201).json({ success: true, message: "Header berhasil dibuat", data });
  } catch (err) {
    console.error("Error createHeader:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateHeader = async (req, res) => {
  try {
    const data = await kdService.updateHeader(req.body);
    res.json({ success: true, message: "Header berhasil diupdate", data });
  } catch (err) {
    console.error("Error updateHeader:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteHeader = async (req, res) => {
  try {
    const noProcKD = req.query.no || "";
    const nip = req.query.nip || "";
    const data = await kdService.deleteHeader(noProcKD, nip);
    res.json({ success: true, message: "Header berhasil dihapus", data });
  } catch (err) {
    console.error("Error deleteHeader:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.addDetail = async (req, res) => {
  try {
    const { no_proc_kd, no_st, no_ruang, nip } = req.body;
    const data = await kdService.addDetail(no_proc_kd, no_st, no_ruang, nip);
    res.status(201).json({ success: true, message: "ST berhasil ditambahkan", data });
  } catch (err) {
    console.error("Error addDetail:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.removeDetail = async (req, res) => {
  try {
    const noProcKD = req.query.no || "";
    const noST = req.query.nost || "";
    const data = await kdService.removeDetail(noProcKD, noST);
    res.json({ success: true, message: "ST berhasil dihapus", data });
  } catch (err) {
    console.error("Error removeDetail:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const noRuang = req.query.no ? parseInt(req.query.no) : 0;
    const data = await kdService.getHistory(noRuang);
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error getHistory:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
