const express = require('express');
const publicController = require('../controllers/publicController');
const validate = require('../middleware/validate');
const { contactLimiter } = require('../middleware/rateLimiters');
const { publicSite: v } = require('../validators/domainValidators');

const router = express.Router();

// Public website data — no authentication, public fields only.
router.get('/teachers', publicController.getTeachers);
router.get('/levels', publicController.getLevels);
router.post('/contact', contactLimiter, validate({ body: v.contact }), publicController.submitContact);

module.exports = router;
