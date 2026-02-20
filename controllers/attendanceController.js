const pool = require('../config/database');

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
          SET status = $1, notes = $2, updated_at = NOW()
          WHERE student_id = $3 AND attendance_date = $4
          RETURNING *
        `, [status, notes || null, student_id, attendance_date]);
      } else {
        // Insert new attendance
        result = await pool.query(`
          INSERT INTO attendance (student_id, attendance_date, status, notes)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `, [student_id, attendance_date, status, notes || null]);
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

// @desc    Get attendance records for a student
// @route   GET /api/attendance/student/:studentId
// @access  Private (Student, Teacher, Admin)
const getStudentAttendance = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { month, year } = req.query;

    let query = `
      SELECT 
        a.attendance_id,
        a.attendance_date,
        a.status,
        a.notes,
        b.batch_name,
        t.full_name as teacher_name
      FROM attendance a
      INNER JOIN students s ON a.student_id = s.student_id
      LEFT JOIN batches b ON s.batch_id = b.batch_id
      LEFT JOIN teachers t ON b.teacher_id = t.teacher_id
      WHERE a.student_id = $1
    `;

    const queryParams = [studentId];

    // Filter by month and year if provided
    if (month && year) {
      query += ` AND EXTRACT(MONTH FROM a.attendance_date) = $2 
                 AND EXTRACT(YEAR FROM a.attendance_date) = $3`;
      queryParams.push(month, year);
    }

    query += ' ORDER BY a.attendance_date DESC';

    const result = await pool.query(query, queryParams);

    // Calculate statistics
    const totalClasses = result.rows.length;
    const presentCount = result.rows.filter(r => r.status === 'present').length;
    const absentCount = result.rows.filter(r => r.status === 'absent').length;
    const lateCount = result.rows.filter(r => r.status === 'late').length;
    const attendancePercentage = totalClasses > 0 
      ? ((presentCount + (lateCount * 0.5)) / totalClasses * 100).toFixed(2)
      : 0;

    res.json({
      records: result.rows,
      statistics: {
        total_classes: totalClasses,
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        attendance_percentage: parseFloat(attendancePercentage)
      }
    });
  } catch (error) {
    console.error('Error fetching student attendance:', error);
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
      LEFT JOIN attendance a ON s.student_id = a.student_id AND a.attendance_date = $1
      WHERE s.batch_id = $2 AND s.status = 'active'
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
        COUNT(DISTINCT s.student_id) as total_students,
        COUNT(DISTINCT CASE WHEN a.status = 'present' THEN a.attendance_id END) as total_present,
        COUNT(DISTINCT CASE WHEN a.status = 'absent' THEN a.attendance_id END) as total_absent,
        COUNT(DISTINCT CASE WHEN a.status = 'late' THEN a.attendance_id END) as total_late,
        ROUND(
          COUNT(DISTINCT CASE WHEN a.status = 'present' THEN a.attendance_id END)::numeric / 
          NULLIF(COUNT(DISTINCT a.attendance_id), 0) * 100, 
          2
        ) as attendance_percentage
      FROM batches b
      LEFT JOIN students s ON b.batch_id = s.batch_id AND s.status = 'active'
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
        notes = COALESCE($2, notes),
        updated_at = NOW()
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

module.exports = {
  markAttendance,
  getStudentAttendance,
  getBatchAttendance,
  getAttendanceSummary,
  updateAttendance,
  deleteAttendance
};
