const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const adminController = require('../controllers/adminController');
const attendanceController = require('../controllers/attendanceController');
const { admin: v } = require('../validators/domainValidators');
const { galleryUploader, removeUploadedFile } = require('../middleware/uploadMiddleware');
const { uploadLimiter } = require('../middleware/rateLimiters');

// If validation fails after multer stored a file, delete it.
const cleanupOnError = (err, req, res, next) => {
  removeUploadedFile(req.file).finally(() => next(err));
};

const router = express.Router();

// Every admin route requires a valid session AND the admin role.
router.use(authenticateToken, authorizeRole('admin'));

// Dashboard
router.get('/dashboard', adminController.getDashboard);

// Students
router.get('/students', validate({ query: v.studentsQuery }), adminController.getAllStudents);
router.post('/students', validate({ body: v.createStudent }), adminController.createStudent);
router.post(
  '/students/:student_id/invite',
  validate({ params: v.studentId }),
  adminController.regenerateStudentInvite
);
router.get('/students/:student_id', validate({ params: v.studentId }), adminController.getStudentDetails);
router.put(
  '/students/:student_id',
  validate({ params: v.studentId, body: v.updateStudent }),
  adminController.updateStudent
);
router.delete('/students/:student_id', validate({ params: v.studentId }), adminController.deleteStudent);
router.put(
  '/students/:student_id/status',
  validate({ params: v.studentId, body: v.changeStudentStatus }),
  adminController.changeStudentStatus
);

// Teachers
router.get('/teachers', adminController.getAllTeachers);
router.post('/teachers', validate({ body: v.createTeacher }), adminController.createTeacher);
router.put(
  '/teachers/:teacher_id',
  validate({ params: v.teacherId, body: v.updateTeacher }),
  adminController.updateTeacher
);
router.delete('/teachers/:teacher_id', validate({ params: v.teacherId }), adminController.deleteTeacher);
router.post(
  '/teachers/:teacher_id/invite',
  validate({ params: v.teacherId }),
  adminController.regenerateTeacherInvite
);

// Batches
router.get('/batches', adminController.getAllBatches);
router.post('/batches', validate({ body: v.createBatch }), adminController.createBatch);
router.put('/batches/:batch_id', validate({ params: v.batchId, body: v.updateBatch }), adminController.updateBatch);
router.delete('/batches/:batch_id', validate({ params: v.batchId }), adminController.deleteBatch);

// Fees
router.get('/fees', validate({ query: v.feesQuery }), adminController.getAllFees);
router.post('/fees/record', validate({ body: v.recordFee }), adminController.recordFeePayment);

// Attendance oversight
router.get(
  '/attendance/summary',
  validate({ query: v.attendanceSummaryQuery }),
  attendanceController.getAttendanceSummary
);
router.put(
  '/attendance/:attendance_id',
  validate({ params: v.attendanceId, body: v.updateAttendance }),
  attendanceController.updateAttendance
);
router.delete(
  '/attendance/:attendance_id',
  validate({ params: v.attendanceId }),
  attendanceController.deleteAttendance
);

// Gallery management
router.get('/gallery', adminController.getGallery);
router.post(
  '/gallery',
  uploadLimiter,
  galleryUploader.single('file'),
  galleryUploader.verify,
  validate({ body: v.galleryCreate }),
  adminController.createGalleryItem,
  cleanupOnError
);
router.put(
  '/gallery/:gallery_id',
  validate({ params: v.galleryId, body: v.galleryUpdate }),
  adminController.updateGalleryItem
);
router.delete('/gallery/:gallery_id', validate({ params: v.galleryId }), adminController.deleteGalleryItem);

// Contact-form messages
router.get('/messages', adminController.getContactMessages);
router.put(
  '/messages/:message_id',
  validate({ params: v.messageId, body: v.messageUpdate }),
  adminController.updateContactMessage
);
router.delete('/messages/:message_id', validate({ params: v.messageId }), adminController.deleteContactMessage);

// Analytics
router.get('/analytics/best-teachers', adminController.getBestTeachers);
router.get('/analytics/best-students', adminController.getBestStudents);
router.get('/analytics/enrollment-trends', adminController.getEnrollmentTrends);
router.get('/analytics/discontinuation-reasons', adminController.getDiscontinuationReasons);

// Status changes
router.get('/status-changes', validate({ query: v.statusChangesQuery }), adminController.getStatusChanges);

module.exports = router;
