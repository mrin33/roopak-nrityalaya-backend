const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const studentController = require('../controllers/studentController');
const activityLogController = require('../controllers/activityLogController');
const attendanceController = require('../controllers/attendanceController');
const feeController = require('../controllers/feeController');
const scheduleController = require('../controllers/scheduleController');
const reviewController = require('../controllers/reviewController');
const makeupClassController = require('../controllers/makeupClassController');
const resourceController = require('../controllers/resourceController');
const { student: v } = require('../validators/domainValidators');

const router = express.Router();

// Every student route requires a valid session AND the student role.
// All handlers resolve the student from req.user, never from the URL,
// so one student can never read or change another student's data.
router.use(authenticateToken, authorizeRole('student'));

// Profile & dashboard
router.get('/profile', studentController.getProfile);
router.put('/profile', validate({ body: v.updateProfile }), studentController.updateProfile);
router.get('/dashboard', studentController.getDashboard);
router.put('/payment-window', validate({ body: v.paymentWindow }), studentController.updatePaymentWindow);

// Activity logs
router.get('/activity-logs', activityLogController.getAll);
router.post('/activity-logs', validate({ body: v.createActivityLog }), activityLogController.create);
router.get('/activity-logs/stats', activityLogController.getStats);
router.put(
  '/activity-logs/:log_id',
  validate({ params: v.logId, body: v.updateActivityLog }),
  activityLogController.update
);
router.delete('/activity-logs/:log_id', validate({ params: v.logId }), activityLogController.delete);

// Attendance
router.get('/attendance', validate({ query: v.attendanceQuery }), attendanceController.getStudentAttendance);
router.get('/attendance/summary', attendanceController.getAttendanceSummaryForStudent);

// Fees
router.get('/fees', feeController.getAllFees);
router.get('/fees/current', feeController.getCurrentPayment);
router.get('/fees/history', feeController.getPaymentHistory);

// Schedule
router.get('/schedule', scheduleController.getStudentSchedule);

// Reviews from teachers
router.get('/reviews', validate({ query: v.reviewsQuery }), reviewController.getStudentReviews);
router.put('/reviews/:review_id/viewed', validate({ params: v.reviewId }), reviewController.markViewed);

// Learning resources for the student's level
router.get('/resources', resourceController.getStudentResources);

// Makeup classes
router.get('/missed-classes', makeupClassController.getMissedClasses);
router.get('/makeup-batches', makeupClassController.getAvailableBatches);
router.get('/makeup-requests', makeupClassController.getMyRequests);
router.post('/makeup-requests', validate({ body: v.createMakeup }), makeupClassController.create);

module.exports = router;
