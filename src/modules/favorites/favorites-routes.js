const express = require('express');
const verifyToken = require('../../core/middleware/verify-token');
const favoritesController = require('./favorites-controller');

const router = express.Router();

router.use(express.json());

router.get('/favorites', verifyToken, favoritesController.getFavorites);
router.post('/favorites', verifyToken, favoritesController.saveFavorite);
router.delete('/favorites/:menuId', verifyToken, favoritesController.deleteFavorite);
router.put('/favorites/order', verifyToken, favoritesController.updateFavoriteOrder);

module.exports = router;
