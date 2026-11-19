const pool = require('../config/database');

// ========== TEACHER/ADMIN METHODS (Keep your existing ones) ==========

// @desc    Mark attendance for a class
// @route   POST /api/attendance/mark
// @access  Private (Teacher)
const markAttendance = async (req, res) => {
  try {
    const { batch_id, attendance_date, attendance_records } = req.body;

    // Validate input
    if (!batch_id || !attendance_date || !Array.isArray(attendance_records)) {
      return res.status(400).json({ 
        message: 'batch_id, attendance_date, and attendance_records array are required' 
      });
    }

    // Get teacher_id from user
    const teacherResult = await pool.query(
      'SELECT teacher_id FROM teachers WHERE user_id = $1',
      [req.user.userId]
    );

    if (teacherResult.rows.length === 0) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    const teacherId = teacherResult.rows[0].teacher_id;

    // Verify teacher owns this batch
    const batchCheck = await pool.query(
      'SELECT batch_id FROM batches WHERE batch_id = $1 AND teacher_id = $2',
      [batch_id, teacherId]
    );

    if (batchCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Unauthorized: You do not teach this batch' });
    }

    // Begin transaction
    await pool.query('BEGIN');

    const markedAttendance = [];

    // Insert/Update attendance for each student
    for (const record of attendance_records) {
      const { student_id, status, notes } = record;

      // Check if attendance already exists for this date
      const existingAttendance = await pool.query(
        'SELECT attendance_id FROM attendance WHERE student_id = $1 AND attendance_date = $2',
        [student_id, attendance_date]
      );

      let result;

      if (existingAttendance.rows.length > 0) {
        // Update existing attendance
        result = await pool.query(`
          UPDATE attendance 
          SET status = $1, notes = $2
          WHERE student_id = $3 AND attendance_date = $4
          RETURNING *
        `, [status, notes || null, student_id, attendance_date]);
      } else {
        // Insert new attendance
        result = await pool.query(`
          INSERT INTO attendance (student_id, batch_id, attendance_date, status, marked_by, notes)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `, [student_id, batch_id, attendance_date, status, teacherId, notes || null]);
      }

      markedAttendance.push(result.rows[0]);
    }

    await pool.query('COMMIT');

    res.status(201).json({
      message: 'Attendance marked successfully',
      attendance: markedAttendance
    });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error marking attendance:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get attendance records for a batch
// @route   GET /api/attendance/batch/:batchId
// @access  Private (Teacher, Admin)
const getBatchAttendance = async (req, res) => {
  try {
    const { batchId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: 'Date parameter is required' });
    }

    const result = await pool.query(`
      SELECT 
        s.student_id,
        s.roll_number,
        s.full_name,
        COALESCE(a.status, 'unmarked') as status,
        a.notes,
        a.attendance_id
      FROM students s
      INNER JOIN student_batches sb ON s.student_id = sb.student_id AND sb.is_active = true
      LEFT JOIN attendance a ON s.student_id = a.student_id AND a.attendance_date = $1
      WHERE sb.batch_id = $2 AND s.is_active = true
      ORDER BY s.roll_number
    `, [date, batchId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching batch attendance:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get attendance summary for all batches (Admin)
// @route   GET /api/attendance/summary
// @access  Private (Admin)
const getAttendanceSummary = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let query = `
      SELECT 
        b.batch_name,
        COUNT(DISTINCT sb.student_id) as total_students,
        COUNT(DISTINCT CASE WHEN a.status = 'present' THEN a.attendance_id END) as total_present,
        COUNT(DISTINCT CASE WHEN a.status = 'absent' THEN a.attendance_id END) as total_absent,
        COUNT(DISTINCT CASE WHEN a.status = 'late' THEN a.attendance_id END) as total_late,
        ROUND(
          COUNT(DISTINCT CASE WHEN a.status = 'present' THEN a.attendance_id END)::numeric / 
          NULLIF(COUNT(DISTINCT a.attendance_id), 0) * 100, 
          2
        ) as attendance_percentage
      FROM batches b
      LEFT JOIN student_batches sb ON b.batch_id = sb.batch_id AND sb.is_active = true
      LEFT JOIN students s ON sb.student_id = s.student_id AND s.is_active = true
      LEFT JOIN attendance a ON s.student_id = a.student_id
    `;

    const queryParams = [];

    if (start_date && end_date) {
      query += ' WHERE a.attendance_date BETWEEN $1 AND $2';
      queryParams.push(start_date, end_date);
    }

    query += ' GROUP BY b.batch_id, b.batch_name ORDER BY b.batch_name';

    const result = await pool.query(query, queryParams);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching attendance summary:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update attendance record
// @route   PUT /api/attendance/:attendanceId
// @access  Private (Teacher, Admin)
const updateAttendance = async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const { status, notes } = req.body;

    const result = await pool.query(`
      UPDATE attendance 
      SET 
        status = COALESCE($1, status),
        notes = COALESCE($2, notes)
      WHERE attendance_id = $3
      RETURNING *
    `, [status, notes, attendanceId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    res.json({
      message: 'Attendance updated successfully',
      attendance: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating attendance:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Delete attendance record
// @route   DELETE /api/attendance/:attendanceId
// @access  Private (Admin)
const deleteAttendance = async (req, res) => {
  try {
    const { attendanceId } = req.params;

    const result = await pool.query(
      'DELETE FROM attendance WHERE attendance_id = $1 RETURNING *',
      [attendanceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    res.json({ message: 'Attendance record deleted successfully' });
  } catch (error) {
    console.error('Error deleting attendance:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ========== NEW STUDENT METHODS (Add these) ==========

// @desc    Get attendance records for current student
// @route   GET /api/students/attendance
// @access  Private (Student)
const getStudentAttendance = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { month, year } = req.query;

    // Get student_id
    const studentQuery = 'SELECT student_id FROM students WHERE user_id = $1';
    const studentResult = await pool.query(studentQuery, [userId]);
    const studentId = studentResult.rows[0]?.student_id;

    if (!studentId) {
      return res.status(404).json({ error: 'Student not found' });
    }

    let query = `
      SELECT 
        a.attendance_id,
        a.attendance_date,
        a.status,
        a.notes,
        b.batch_name
      FROM attendance a
      LEFT JOIN batches b ON a.batch_id = b.batch_id
      WHERE a.student_id = $1
    `;

    const params = [studentId];

    // Add month/year filter if provided
    if (month && year) {
      query += ` AND EXTRACT(MONTH FROM a.attendance_date) = $2 AND EXTRACT(YEAR FROM a.attendance_date) = $3`;
      params.push(month, year);
    }

    query += ` ORDER BY a.attendance_date DESC`;

    const result = await pool.query(query, params);

    // Calculate overall statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_classes,
        COUNT(*) FILTER (WHERE status = 'present') as present,
        COUNT(*) FILTER (WHERE status = 'absent') as absent,
        COUNT(*) FILTER (WHERE status = 'late') as late,
        ROUND(
          (COUNT(*) FILTER (WHERE status = 'present')::numeric / 
          NULLIF(COUNT(*), 0)::numeric) * 100, 
          2
        ) as percentage
      FROM attendance
      WHERE student_id = $1
    `;

    const statsResult = await pool.query(statsQuery, [studentId]);

    res.json({
      records: result.rows,
      overall: {
        present: parseInt(statsResult.rows[0].present) || 0,
        absent: parseInt(statsResult.rows[0].absent) || 0,
        late: parseInt(statsResult.rows[0].late) || 0,
        percentage: parseFloat(statsResult.rows[0].percentage) || 0
      }
    });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// @desc    Get attendance summary for dashboard
// @route   GET /api/students/attendance/summary
// @access  Private (Student)
const getAttendanceSummaryForStudent = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get student_id
    const studentQuery = 'SELECT student_id FROM students WHERE user_id = $1';
    const studentResult = await pool.query(studentQuery, [userId]);
    const studentId = studentResult.rows[0]?.student_id;

    if (!studentId) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Get last 30 days attendance
    const query = `
      SELECT 
        COUNT(*) as total_classes,
        COUNT(*) FILTER (WHERE status = 'present') as present_count,
        ROUND(
          (COUNT(*) FILTER (WHERE status = 'present')::numeric / 
          NULLIF(COUNT(*), 0)::numeric) * 100, 
          2
        ) as percentage
      FROM attendance
      WHERE student_id = $1
      AND attendance_date >= CURRENT_DATE - INTERVAL '30 days'
    `;

    const result = await pool.query(query, [studentId]);

    res.json({
      totalClasses: parseInt(result.rows[0].total_classes) || 0,
      presentCount: parseInt(result.rows[0].present_count) || 0,
      percentage: parseFloat(result.rows[0].percentage) || 0
    });
  } catch (error) {
    console.error('Error fetching attendance summary:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  markAttendance,
  getBatchAttendance,
  getAttendanceSummary,
  updateAttendance,
  deleteAttendance,
  // NEW student methods
  getStudentAttendance,
  getAttendanceSummaryForStudent
};
