const express = require('express');
const galleryRequestController = require('../controllers/galleryRequestController');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const { upload, verifyUploadedFile, removeUploadedFile } = require('../middleware/uploadMiddleware');
const { uploadLimiter } = require('../middleware/rateLimiters');
const validate = require('../middleware/validate');
const { content: v } = require('../validators/domainValidators');

const router = express.Router();

// If body validation fails after multer stored the file, delete it.
const cleanupOnError = (err, req, res, next) => {
  removeUploadedFile(req.file).finally(() => next(err));
};

// Student
router.get('/student', authenticateToken, authorizeRole('student'), galleryRequestController.getStudentRequests);
router.post(
  '/student/upload',
  authenticateToken,
  authorizeRole('student'),
  uploadLimiter,
  upload.single('file'),
  verifyUploadedFile,
  validate({ body: v.galleryUpload }),
  galleryRequestController.createRequest,
  cleanupOnError
);

// Admin
router.get('/admin', authenticateToken, authorizeRole('admin'), galleryRequestController.getAllRequests);
router.put(
  '/admin/:id/status',
  authenticateToken,
  authorizeRole('admin'),
  validate({ params: v.galleryRequestId, body: v.galleryDecision }),
  galleryRequestController.updateRequestStatus
);

// Owner student or admin: view the (possibly pending/rejected) file itself
router.get(
  '/:id/file',
  authenticateToken,
  authorizeRole('student', 'admin'),
  validate({ params: v.galleryRequestId }),
  galleryRequestController.getRequestFile
);

module.exports = router;
