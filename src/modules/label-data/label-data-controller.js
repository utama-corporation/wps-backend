const labelDataService = require('./label-data-service');

exports.getLabelData = async (req, res) => {
  const { nolabel } = req.params;
  const { username } = req;

  if (!nolabel || /[^a-zA-Z0-9._-]/.test(nolabel)) {
    return res.status(400).json({ message: 'NoLabel tidak valid' });
  }

  try {
    const data = await labelDataService.getLabelData(nolabel);

    if (!data) {
      return res.status(404).json({ message: `Data dengan label ${nolabel} tidak ditemukan` });
    }

    res.json({
      ...data,
      username, // tetap tampilkan username login 345
    });
  } catch (error) {
    console.error('Error details:', error);
    res.status(500).json({
      message: 'Internal Server Error',
      error: error.message
    });
  }
};
