const svc = require("./bongkar-stick-reminder-service");
const penjualanStService = require("../penjualan/st/penjualan-st-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

/* GET /api/bongkar-stick-reminder */
exports.getList = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getList() });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/bongkar-stick-reminder/label-info?label= (detail label ST, dipakai ulang dari Penjualan ST) */
exports.getLabelInfo = async (req, res) => {
  try {
    res.json({ success: true, data: await penjualanStService.getLabelInfo(req.query.label) });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/bongkar-stick-reminder/setting */
exports.getSetting = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getSetting() });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/bongkar-stick-reminder/setting  { warningDays, criticalDays } */
exports.updateSetting = async (req, res) => {
  try {
    const data = await svc.updateSetting(req.body || {}, req.username);
    res.json({ success: true, data, message: "Pengaturan berhasil disimpan" });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/bongkar-stick-reminder/:noST/flag  { isGoingToBeUsed } */
exports.setFlag = async (req, res) => {
  try {
    const data = await svc.setFlag(req.params.noST, req.body || {}, req.username);
    res.json({ success: true, data, message: "Penanda berhasil disimpan" });
  } catch (err) {
    fail(res, err);
  }
};
