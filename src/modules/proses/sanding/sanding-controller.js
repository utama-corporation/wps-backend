const service = require("./sanding-service");
// Health check
async function handle(req, res, serviceName, caption, isLabel = false) {
  try {
    const tgl = req.query.tgl ? new Date(req.query.tgl) : new Date();
    const jenis = req.query.jenis || "";

    const fn = service[serviceName];
    if (typeof fn !== "function") {
      return res.status(400).json({ success: false, message: "Handler tidak valid" });
    }

    if (isLabel) {
      const data = await fn(jenis, tgl);
      return res.status(200).json({
        success: true,
        message: `${caption} berhasil diambil`,
        data,
        meta: { tgl: tgl.toISOString().slice(0, 10) },
      });
    }

    const [stock, oldestDate] = await Promise.all([
      fn(tgl),
      service.getOldestDate(),
    ]);
    return res.status(200).json({
      success: true,
      message: `${caption} berhasil diambil`,
      data: stock,
      meta: { tgl: tgl.toISOString().slice(0, 10), oldestDate },
    });
  } catch (err) {
    console.error(`Error ${serviceName}:`, err);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan di server" });
  }
}

exports.getSandingStock = (req, res) => handle(req, res, "getStock", "Stok Sanding");
exports.getSandingLabels = (req, res) => handle(req, res, "getLabels", "Label Sanding", true);
