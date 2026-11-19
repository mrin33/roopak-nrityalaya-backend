const express = require('express');
const router = express.Router();
const galleryRequestController = require('../controllers/galleryRequestController');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// Student requests
router.get('/student', authenticateToken, authorizeRole('student'), galleryRequestController.getStudentRequests);

// Ensure name 'file' matches the formData.append('file', file) field
router.post('/student/upload', authenticateToken, authorizeRole('student'), upload.single('file'), galleryRequestController.createRequest);

// Admin routes
router.get('/admin', authenticateToken, authorizeRole('admin'), galleryRequestController.getAllRequests);
router.put('/admin/:id/status', authenticateToken, authorizeRole('admin'), galleryRequestController.updateRequestStatus);

module.exports = router;
