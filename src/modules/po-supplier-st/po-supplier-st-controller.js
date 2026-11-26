const service = require("./po-supplier-st-service");

const noOf = (req) => String(req.params.no || "").trim();

/** Bungkus handler: respons {success, message, data} + penanganan error seragam. */
const handle = (label, fn) => async (req, res) => {
  try {
    const { status = 200, message, ...body } = await fn(req);
    return res.status(status).json({ success: true, message, ...body });
  } catch (err) {
    console.error(`POSupplierST ${label} Error:`, err);
    return res.status(err.statusCode || err.status || 500).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

exports.getAll = handle("List", async (req) => {
  const result = await service.getAll(req.query);
  return { message: "List PO berhasil diambil", ...result };
});

exports.getMasters = handle("Masters", async () => ({
  message: "Masters berhasil diambil",
  data: await service.getMasters(),
}));

exports.getByNo = handle("Get", async (req) => ({
  message: "PO berhasil diambil",
  data: await service.getByNo(noOf(req)),
}));

exports.create = handle("Create", async (req) => {
  const data = await service.create(req.body || {}, req.idUsername);
  return { status: 201, message: `Berhasil disimpan dengan No.PO ${data.noPO}`, data };
});

exports.update = handle("Update", async (req) => {
  const data = await service.update(noOf(req), req.body || {});
  return { message: `PO ${data.noPO} berhasil diupdate`, data };
});

exports.remove = handle("Delete", async (req) => {
  const data = await service.remove(noOf(req));
  return { message: `PO ${data.noPO} berhasil dihapus`, data };
});

exports.close = handle("Close", async (req) => {
  const data = await service.setClosed(noOf(req), true, req.idUsername);
  return { message: `PO ${data.noPO} ditutup`, data };
});

exports.reopen = handle("Reopen", async (req) => {
  const data = await service.setClosed(noOf(req), false, req.idUsername);
  return { message: `PO ${data.noPO} dibuka kembali`, data };
});
