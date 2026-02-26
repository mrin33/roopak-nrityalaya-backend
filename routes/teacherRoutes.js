const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const teacherController = require('../controllers/teacherController');
const reviewController = require('../controllers/reviewController');
const batchTransferController = require('../controllers/batchTransferController');

// All routes require authentication and teacher role
router.use(authenticateToken, authorizeRole('teacher'));

// Profile routes
router.get('/profile', teacherController.getProfile);
router.get('/dashboard', teacherController.getDashboard);
router.put('/profile', teacherController.updateProfile);

// Student routes
router.get('/students', teacherController.getStudents);
router.get('/batches', teacherController.getBatches);

// Review routes
router.post('/reviews', reviewController.create);
router.get('/reviews', reviewController.getTeacherReviews);

// Batch Transfer routes
router.get('/batch-transfers', batchTransferController.getMyTransfers);
router.post('/batch-transfers', batchTransferController.create);
router.get('/batch-transfers/available-teachers', batchTransferController.getAvailableTeachers);

// Attendance routes
//router.post('/attendance', teacherController.markAttendance);
//router.get('/attendance', teacherController.getAttendance);

module.exports = router;
