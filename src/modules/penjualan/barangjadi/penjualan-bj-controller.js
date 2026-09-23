const svc = require("./penjualan-bj-service");

/* GET /api/penjualan/bj/list */
exports.getAll = async (req, res) => {
  try {
    const { search, top } = req.query;
    const data = await svc.getAll({ search, topRow: top });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* GET /api/penjualan/bj/detail/:noBJJual */
exports.getDetail = async (req, res) => {
  try {
    const data = await svc.getDetail(req.params.noBJJual);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* GET /api/penjualan/bj/generate-no */
exports.generateNo = async (_req, res) => {
  try {
    const noBJJual = await svc.generateNo();
    res.json({ success: true, data: { noBJJual } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* GET /api/penjualan/bj/spk-list */
exports.getSpkList = async (_req, res) => {
  try {
    const data = await svc.getSpkList();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* GET /api/penjualan/bj/lookup-bj/:noBJ */
exports.lookupBJ = async (req, res) => {
  try {
    const result = await svc.lookupBJ(req.params.noBJ);
    if (result.found) {
      res.json({ success: true, data: result.data });
    } else {
      res.json({ success: false, message: result.reason });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* POST /api/penjualan/bj */
exports.createBJJual = async (req, res) => {
  try {
    const result = await svc.createBJJual(req.body);
    res.json({ success: true, data: result, message: "Penjualan Barang Jadi berhasil disimpan." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* PUT /api/penjualan/bj/:noBJJual */
exports.updateBJJual = async (req, res) => {
  try {
    const result = await svc.updateBJJual(req.params.noBJJual, req.body);
    res.json({ success: true, data: result, message: "Penjualan Barang Jadi berhasil diubah." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* DELETE /api/penjualan/bj/:noBJJual */
exports.deleteBJJual = async (req, res) => {
  try {
    const result = await svc.deleteBJJual(req.params.noBJJual, req.query.user);
    res.json({ success: true, data: result, message: "Penjualan Barang Jadi berhasil dihapus." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* POST /api/penjualan/bj/scan */
exports.scanBJ = async (req, res) => {
  try {
    const { noBJJual, noBJ, tglJual, user } = req.body;
    const result = await svc.scanBJ(noBJJual, noBJ, tglJual, user);
    res.json({ success: true, data: result.data, message: "Label BJ " + noBJ + " berhasil ditambahkan." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
