const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const studentController = require('../controllers/studentController');
const activityLogController = require('../controllers/activityLogController');
const galleryRequestController = require('../controllers/galleryRequestController');
const reviewController = require('../controllers/reviewController');
const makeupClassController = require('../controllers/makeupClassController');
const feeController = require('../controllers/feeController');

// All routes require authentication and student role
router.use(authenticateToken, authorizeRole('student'));

// Profile routes
router.get('/profile', studentController.getProfile);
router.get('/dashboard', studentController.getDashboard);
router.put('/profile', studentController.updateProfile);
router.put('/payment-window', studentController.updatePaymentWindow);

// Activity Log routes
router.post('/activity-logs', activityLogController.create);
router.get('/activity-logs', activityLogController.getAll);
router.get('/activity-logs/stats', activityLogController.getStats);
router.put('/activity-logs/:log_id', activityLogController.update);
router.delete('/activity-logs/:log_id', activityLogController.delete);

// Gallery Request routes
router.post('/gallery-requests', galleryRequestController.create);
router.get('/gallery-requests', galleryRequestController.getMyRequests);

// Review routes
router.get('/reviews', reviewController.getStudentReviews);
router.put('/reviews/:review_id/viewed', reviewController.markViewed);

// Makeup Class routes
router.get('/makeup-classes/missed', makeupClassController.getMissedClasses);
router.post('/makeup-classes', makeupClassController.create);
router.get('/makeup-classes', makeupClassController.getMyRequests);

// Fee routes
router.get('/fees', feeController.getStudentFees);
router.get('/fees/history', feeController.getFeeHistory);
router.post('/fees/:payment_id/pay', feeController.recordPayment);

module.exports = router;
