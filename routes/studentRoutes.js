const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const activityLogController = require('../controllers/activityLogController');
const attendanceController = require('../controllers/attendanceController');
const feeController = require('../controllers/feeController');
const scheduleController = require('../controllers/scheduleController');
const { authenticateToken } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authenticateToken);

// Student profile routes
router.get('/profile', studentController.getProfile);
router.put('/profile', studentController.updateProfile);
router.get('/dashboard', studentController.getDashboard);
router.put('/payment-window', studentController.updatePaymentWindow);

// Activity log routes
router.get('/activity-logs', activityLogController.getAll);
router.post('/activity-logs', activityLogController.create);
router.get('/activity-logs/stats', activityLogController.getStats);
router.put('/activity-logs/:log_id', activityLogController.update);
router.delete('/activity-logs/:log_id', activityLogController.delete);

// Attendance routes
router.get('/attendance', attendanceController.getStudentAttendance);
router.get('/attendance/summary', attendanceController.getAttendanceSummaryForStudent);

// Fee routes
router.get('/fees', feeController.getAllFees);
router.get('/fees/current', feeController.getCurrentPayment);
router.get('/fees/history', feeController.getPaymentHistory);

// Schedule routes
router.get('/schedule', scheduleController.getStudentSchedule);

module.exports = router;