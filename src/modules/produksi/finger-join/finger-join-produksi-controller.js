const service = require("./finger-join-produksi-service");

async function getMesinList(req, res, next) {
  try {
    const data = await service.getMesinList();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getHistory(req, res, next) {
  try {
    const data = await service.getHistory();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getNextNoProduksi(req, res, next) {
  try {
    const value = await service.getNextNoProduksi();
    res.json({ NoProduksi: value });
  } catch (err) {
    next(err);
  }
}

async function getNextNoLabel(req, res, next) {
  try {
    const value = await service.getNextNoLabel();
    res.json({ NoFJ: value });
  } catch (err) {
    next(err);
  }
}

async function getMasterOptions(req, res, next) {
  try {
    const data = await service.getMasterOptions();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function saveHeader(req, res, next) {
  try {
    const noProduksi = await service.saveHeader(req.body);
    res.json({ noProduksi, message: "Header tersimpan" });
  } catch (err) {
    next(err);
  }
}

async function getHeader(req, res, next) {
  try {
    const data = await service.getHeader(req.params.noProduksi);
    if (!data) {
      return res.status(404).json({ message: "Data header tidak ditemukan" });
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function updateHeader(req, res, next) {
  try {
    await service.updateHeader(req.body);
    res.json({ message: "Header berhasil diupdate" });
  } catch (err) {
    next(err);
  }
}

async function createLabel(req, res, next) {
  try {
    const noFJ = await service.createLabel(req.body);
    res.json({ noFJ, message: "Label tersimpan" });
  } catch (err) {
    next(err);
  }
}

async function addInput(req, res, next) {
  try {
    const result = await service.addInput(req.body);
    res.json({ message: "Input ditambahkan", ...result });
  } catch (err) {
    next(err);
  }
}

async function removeInput(req, res, next) {
  try {
    const result = await service.removeInput(req.body);
    res.json({ message: "Input dihapus", ...result });
  } catch (err) {
    next(err);
  }
}

async function addOutput(req, res, next) {
  try {
    const result = await service.addOutput(req.body);
    res.json({ message: "Output ditambahkan", ...result });
  } catch (err) {
    next(err);
  }
}

async function removeOutput(req, res, next) {
  try {
    const result = await service.removeOutput(req.body);
    res.json({ message: "Output dihapus", ...result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMesinList,
  getHistory,
  getNextNoProduksi,
  getNextNoLabel,
  getMasterOptions,
  saveHeader,
  getHeader,
  updateHeader,
  createLabel,
  addInput,
  removeInput,
  addOutput,
  removeOutput,
};
