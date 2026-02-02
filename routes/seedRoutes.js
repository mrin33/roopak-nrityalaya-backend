const express = require('express');
const router = express.Router();
const seedController = require('../controllers/seedController');

// Create test accounts (Teacher & Admin)
router.post('/test-accounts', seedController.createTestAccounts);

// Delete test accounts
router.delete('/test-accounts', seedController.deleteTestAccounts);

module.exports = router;
