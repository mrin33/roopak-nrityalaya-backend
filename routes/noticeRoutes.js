const express = require('express');
const router = express.Router();
const noticeController = require('../controllers/noticeController');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

// Public or Authenticated routes
// Everyone can view published notices
router.get('/', noticeController.getNotices);

// Admin-only routes
router.get('/admin', authenticateToken, authorizeRole('admin'), noticeController.getAllAdminNotices);
router.post('/', authenticateToken, authorizeRole('admin'), noticeController.createNotice);
router.put('/:id', authenticateToken, authorizeRole('admin'), noticeController.updateNotice);
router.delete('/:id', authenticateToken, authorizeRole('admin'), noticeController.deleteNotice);

module.exports = router;
