const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

// Public routes (no authentication required)
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected routes (authentication required)
router.get('/me', authMiddleware, authController.getMe);
router.post('/logout', authMiddleware, authController.logout);

module.exports = router;
