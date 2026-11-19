const express = require('express');
const noticeController = require('../controllers/noticeController');
const { authenticateToken, optionalAuth, authorizeRole } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { content: v } = require('../validators/domainValidators');

const router = express.Router();

// Public: published notices; audience depends on who is viewing.
router.get('/', optionalAuth, validate({ query: v.noticesQuery }), noticeController.getNotices);

// Admin only
router.get('/admin', authenticateToken, authorizeRole('admin'), noticeController.getAllAdminNotices);
router.post(
  '/',
  authenticateToken,
  authorizeRole('admin'),
  validate({ body: v.noticeBody }),
  noticeController.createNotice
);
router.put(
  '/:id',
  authenticateToken,
  authorizeRole('admin'),
  validate({ params: v.noticeId, body: v.noticeBody }),
  noticeController.updateNotice
);
router.delete(
  '/:id',
  authenticateToken,
  authorizeRole('admin'),
  validate({ params: v.noticeId }),
  noticeController.deleteNotice
);

module.exports = router;
