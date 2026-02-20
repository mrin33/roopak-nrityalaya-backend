const pool = require('../config/database');

// @desc    Get teacher profile
// @route   GET /api/teachers/profile
// @access  Private (Teacher)
const getProfile = async (req, res) => {
  try {
    const teacherId = req.user.userId;

    const result = await pool.query(`
      SELECT 
        t.teacher_id,
        t.user_id,
        t.full_name,
        t.email,
        t.phone,
        t.specialization,
        t.experience_years,
        t.bio,
        t.photo_url,
        t.is_active,
        COUNT(DISTINCT s.student_id) as total_students,
        COALESCE(AVG(r.overall_rating), 0) as avg_rating
      FROM teachers t
      LEFT JOIN batches b ON t.teacher_id = b.teacher_id
      LEFT JOIN students s ON b.batch_id = s.batch_id AND s.status = 'active'
      LEFT JOIN reviews r ON t.teacher_id = r.teacher_id
      WHERE t.user_id = $1
      GROUP BY t.teacher_id, t.user_id, t.full_name, t.email, t.phone, 
               t.specialization, t.experience_years, t.bio, t.photo_url, t.is_active
    `, [req.user.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Teacher profile not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching teacher profile:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get teacher dashboard data
// @route   GET /api/teachers/dashboard
// @access  Private (Teacher)
const getDashboard = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT teacher_id FROM teachers WHERE user_id = $1
    `, [req.user.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    const teacherId = result.rows[0].teacher_id;

    // Get total students
    const studentsResult = await pool.query(`
      SELECT COUNT(DISTINCT s.student_id) as total_students
      FROM students s
      INNER JOIN batches b ON s.batch_id = b.batch_id
      WHERE b.teacher_id = $1 AND s.status = 'active'
    `, [teacherId]);

    // Get total batches
    const batchesResult = await pool.query(`
      SELECT COUNT(*) as total_batches
      FROM batches
      WHERE teacher_id = $1
    `, [teacherId]);

    // Get average rating
    const ratingResult = await pool.query(`
      SELECT COALESCE(AVG(overall_rating), 0) as avg_rating
      FROM reviews
      WHERE teacher_id = $1
    `, [teacherId]);

    // Get recent reviews (last 5)
    const recentReviews = await pool.query(`
      SELECT 
        r.*,
        s.full_name as student_name,
        s.roll_number
      FROM reviews r
      INNER JOIN students s ON r.student_id = s.student_id
      WHERE r.teacher_id = $1
      ORDER BY r.created_at DESC
      LIMIT 5
    `, [teacherId]);

    res.json({
      total_students: parseInt(studentsResult.rows[0].total_students),
      total_batches: parseInt(batchesResult.rows[0].total_batches),
      avg_rating: parseFloat(ratingResult.rows[0].avg_rating).toFixed(1),
      recent_reviews: recentReviews.rows
    });
  } catch (error) {
    console.error('Error fetching teacher dashboard:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update teacher profile
// @route   PUT /api/teachers/profile
// @access  Private (Teacher)
const updateProfile = async (req, res) => {
  try {
    const { phone, bio, photo_url } = req.body;

    const result = await pool.query(`
      UPDATE teachers 
      SET 
        phone = COALESCE($1, phone),
        bio = COALESCE($2, bio),
        photo_url = COALESCE($3, photo_url),
        updated_at = NOW()
      WHERE user_id = $4
      RETURNING teacher_id, full_name, email, phone, bio, photo_url
    `, [phone, bio, photo_url, req.user.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      teacher: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating teacher profile:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get teacher's students
// @route   GET /api/teachers/students
// @access  Private (Teacher)
const getStudents = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT teacher_id FROM teachers WHERE user_id = $1
    `, [req.user.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    const teacherId = result.rows[0].teacher_id;

    const students = await pool.query(`
      SELECT 
        s.student_id,
        s.roll_number,
        s.full_name,
        s.email,
        s.phone,
        l.level_name,
        b.batch_name,
        s.status,
        COALESCE(
          (SELECT COUNT(*) * 100.0 / NULLIF(
            (SELECT COUNT(*) FROM batches WHERE batch_id = s.batch_id), 0
          )
          FROM attendance a
          WHERE a.student_id = s.student_id 
          AND a.status = 'present'
          AND a.attendance_date >= DATE_TRUNC('month', CURRENT_DATE)),
          0
        ) as attendance_percentage
      FROM students s
      INNER JOIN batches b ON s.batch_id = b.batch_id
      INNER JOIN levels l ON s.level_id = l.level_id
      WHERE b.teacher_id = $1 AND s.status = 'active'
      ORDER BY s.roll_number
    `, [teacherId]);

    res.json(students.rows);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get teacher's batches
// @route   GET /api/teachers/batches
// @access  Private (Teacher)
const getBatches = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT teacher_id FROM teachers WHERE user_id = $1
    `, [req.user.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    const teacherId = result.rows[0].teacher_id;

    const batches = await pool.query(`
      SELECT 
        b.batch_id,
        b.batch_name,
        l.level_name,
        b.schedule,
        b.time,
        b.room,
        b.current_enrolled,
        b.max_students,
        COUNT(s.student_id) as active_students
      FROM batches b
      INNER JOIN levels l ON b.level_id = l.level_id
      LEFT JOIN students s ON b.batch_id = s.batch_id AND s.status = 'active'
      WHERE b.teacher_id = $1
      GROUP BY b.batch_id, b.batch_name, l.level_name, b.schedule, b.time, b.room, b.current_enrolled, b.max_students
      ORDER BY b.batch_name
    `, [teacherId]);

    res.json(batches.rows);
  } catch (error) {
    console.error('Error fetching batches:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getProfile,
  getDashboard,
  updateProfile,
  getStudents,
  getBatches
};
