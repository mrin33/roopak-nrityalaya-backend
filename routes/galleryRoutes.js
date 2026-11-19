const express = require('express');
const galleryController = require('../controllers/galleryController');

const router = express.Router();

// Public gallery listing (only items an admin has approved/made visible)
router.get('/', galleryController.getPublicGallery);

module.exports = router;
