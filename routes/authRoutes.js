const express = require('express');
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { loginLimiter, registerLimiter, passwordSetupLimiter } = require('../middleware/rateLimiters');
const v = require('../validators/authValidators');
const { z } = require('../validators/common');

const router = express.Router();

// Public
router.post('/register', registerLimiter, validate({ body: v.register }), authController.register);
router.post('/login', loginLimiter, validate({ body: v.login }), authController.login);
router.get(
  '/password-setup/:token',
  passwordSetupLimiter,
  validate({ params: z.object({ token: z.string().min(20).max(200) }) }),
  authController.checkSetupToken
);
router.post('/set-password', passwordSetupLimiter, validate({ body: v.setPassword }), authController.setPassword);

// Authenticated
router.get('/me', authenticateToken, authController.getMe);
router.post('/logout', authenticateToken, authController.logout);
router.put(
  '/change-password',
  authenticateToken,
  passwordSetupLimiter,
  validate({ body: v.changePassword }),
  authController.changePassword
);

module.exports = router;
