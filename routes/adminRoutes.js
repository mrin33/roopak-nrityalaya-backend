const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const adminController = require('../controllers/adminController');

// All routes require authentication and admin role
router.use(authenticateToken, authorizeRole('admin'));

// Dashboard
router.get('/dashboard', adminController.getDashboard);

// Student management
router.get('/students', adminController.getAllStudents);
router.get('/students/:student_id', adminController.getStudentDetails);
router.put('/students/:student_id', adminController.updateStudent);
router.delete('/students/:student_id', adminController.deleteStudent);
router.put('/students/:student_id/status', adminController.changeStudentStatus);

// Teacher management
router.get('/teachers', adminController.getAllTeachers);
router.post('/teachers', adminController.createTeacher);
router.put('/teachers/:teacher_id', adminController.updateTeacher);
router.delete('/teachers/:teacher_id', adminController.deleteTeacher);

// Batch management
router.get('/batches', adminController.getAllBatches);
router.post('/batches', adminController.createBatch);
router.put('/batches/:batch_id', adminController.updateBatch);
router.delete('/batches/:batch_id', adminController.deleteBatch);

// Fee management
router.get('/fees', adminController.getAllFees);
router.post('/fees/record', adminController.recordFeePayment);

// Analytics
router.get('/analytics/best-teachers', adminController.getBestTeachers);
router.get('/analytics/best-students', adminController.getBestStudents);
router.get('/analytics/enrollment-trends', adminController.getEnrollmentTrends);
router.get('/analytics/discontinuation-reasons', adminController.getDiscontinuationReasons);

// Status changes
router.get('/status-changes', adminController.getStatusChanges);

module.exports = router;
