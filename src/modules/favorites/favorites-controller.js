const favoritesService = require('./favorites-service');

exports.getFavorites = async (req, res) => {
  const username = req.username;
  try {
    const data = await favoritesService.getFavoritesService(username);
    res.status(200).json({ success: true, message: 'Favorit ditemukan', data });
  } catch (err) {
    console.error('Error fetching favorites:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
  }
};

exports.saveFavorite = async (req, res) => {
  const username = req.username;
  const { menuId, note, sortOrder } = req.body;
  if (!menuId) {
    return res.status(400).json({ success: false, message: 'menuId wajib diisi.' });
  }
  try {
    await favoritesService.saveFavoriteService(username, menuId, note, sortOrder);
    res.status(200).json({ success: true, message: 'Favorit disimpan.' });
  } catch (err) {
    console.error('Error saving favorite:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
  }
};

exports.deleteFavorite = async (req, res) => {
  const username = req.username;
  const menuId = parseInt(req.params.menuId, 10);
  if (!menuId) {
    return res.status(400).json({ success: false, message: 'menuId tidak valid.' });
  }
  try {
    await favoritesService.deleteFavoriteService(username, menuId);
    res.status(200).json({ success: true, message: 'Favorit dihapus.' });
  } catch (err) {
    console.error('Error deleting favorite:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
  }
};

exports.updateFavoriteOrder = async (req, res) => {
  const username = req.username;
  const items = req.body && Array.isArray(req.body.items) ? req.body.items : [];
  try {
    await favoritesService.updateFavoriteOrderService(username, items);
    res.status(200).json({ success: true, message: 'Urutan favorit disimpan.' });
  } catch (err) {
    console.error('Error updating favorite order:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
  }
};
