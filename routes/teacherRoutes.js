const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const teacherController = require('../controllers/teacherController');
const reviewController = require('../controllers/reviewController');
const batchTransferController = require('../controllers/batchTransferController');
const attendanceController = require('../controllers/attendanceController');
const makeupClassController = require('../controllers/makeupClassController');
const { teacher: v } = require('../validators/domainValidators');

const router = express.Router();

// Every teacher route requires a valid session AND the teacher role.
// Batch/student ownership is verified inside each handler.
router.use(authenticateToken, authorizeRole('teacher'));

// Profile & dashboard
router.get('/profile', teacherController.getProfile);
router.get('/dashboard', teacherController.getDashboard);
router.put('/profile', validate({ body: v.updateProfile }), teacherController.updateProfile);

// Students & batches
router.get('/students', teacherController.getStudents);
router.get('/batches', teacherController.getBatches);

// Attendance
router.post('/attendance', validate({ body: v.markAttendance }), attendanceController.markAttendance);
router.get(
  '/batches/:batch_id/attendance',
  validate({ params: v.batchAttendanceParams, query: v.batchAttendanceQuery }),
  attendanceController.getBatchAttendance
);

// Reviews
router.post('/reviews', validate({ body: v.createReview }), reviewController.create);
router.get('/reviews', reviewController.getTeacherReviews);

// Batch transfers
router.get('/batch-transfers', batchTransferController.getMyTransfers);
router.post('/batch-transfers', validate({ body: v.createTransfer }), batchTransferController.create);
router.get('/batch-transfers/available-teachers', batchTransferController.getAvailableTeachers);

// Makeup class requests targeting this teacher's batches
router.get('/makeup-requests', makeupClassController.getTeacherRequests);
router.put(
  '/makeup-requests/:booking_id',
  validate({ params: v.makeupId, body: v.makeupDecision }),
  makeupClassController.updateStatus
);

module.exports = router;
