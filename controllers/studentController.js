const pool = require('../config/database');

const studentController = {
  // Get student profile
  async getProfile(req, res) {
    try {
      const userId = req.user.user_id;

      const query = `
        SELECT 
          s.*,
          l.level_name,
          l.level_code,
          l.monthly_fee,
          u.email,
          b.batch_name,
          b.schedule,
          b.time,
          t.full_name as teacher_name
        FROM students s
        LEFT JOIN levels l ON s.level_id = l.level_id
        LEFT JOIN users u ON s.user_id = u.user_id
        LEFT JOIN student_batches sb ON s.student_id = sb.student_id AND sb.is_active = true
        LEFT JOIN batches b ON sb.batch_id = b.batch_id
        LEFT JOIN teachers t ON b.teacher_id = t.teacher_id
        WHERE s.user_id = $1
      `;

      const result = await pool.query(query, [userId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Student profile not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error fetching student profile:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get student dashboard data
  async getDashboard(req, res) {
    try {
      const userId = req.user.user_id;

      // Get student
      const studentQuery = `
        SELECT s.*, l.level_name, l.monthly_fee
        FROM students s
        LEFT JOIN levels l ON s.level_id = l.level_id
        WHERE s.user_id = $1
      `;
      const studentResult = await pool.query(studentQuery, [userId]);
      const student = studentResult.rows[0];

      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      // Get attendance percentage (last 30 days)
      const attendanceQuery = `
        SELECT 
          COUNT(*) FILTER (WHERE status = 'present') as present_count,
          COUNT(*) as total_count
        FROM attendance
        WHERE student_id = $1
        AND attendance_date >= CURRENT_DATE - INTERVAL '30 days'
      `;
      const attendanceResult = await pool.query(attendanceQuery, [student.student_id]);
      const attendance = attendanceResult.rows[0];
      const attendancePercentage = attendance.total_count > 0 
        ? Math.round((attendance.present_count / attendance.total_count) * 100)
        : 0;

      // Get batch info
      const batchQuery = `
        SELECT b.*, t.full_name as teacher_name
        FROM batches b
        INNER JOIN student_batches sb ON b.batch_id = sb.batch_id
        LEFT JOIN teachers t ON b.teacher_id = t.teacher_id
        WHERE sb.student_id = $1 AND sb.is_active = true
        LIMIT 1
      `;
      const batchResult = await pool.query(batchQuery, [student.student_id]);
      const batchInfo = batchResult.rows[0];

      // Get next payment
      const feeQuery = `
        SELECT * FROM fee_payments
        WHERE student_id = $1 AND status = 'pending'
        ORDER BY due_date ASC
        LIMIT 1
      `;
      const feeResult = await pool.query(feeQuery, [student.student_id]);
      const nextPayment = feeResult.rows[0];

      // Get recent notices
      const noticesQuery = `
        SELECT * FROM notices
        WHERE status = 'published'
        ORDER BY created_at DESC
        LIMIT 5
      `;
      const noticesResult = await pool.query(noticesQuery);

      // Calculate performance score
      const performanceScore = this.calculatePerformanceScore(student, attendancePercentage);

      res.json({
        student,
        attendancePercentage,
        batchInfo,
        nextPayment,
        performanceScore,
        recentNotices: noticesResult.rows,
        has_late_fee: nextPayment && nextPayment.late_fee > 0,
        late_fee_amount: nextPayment ? nextPayment.late_fee : 0
      });
    } catch (error) {
      console.error('Error fetching dashboard:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Update profile
  async updateProfile(req, res) {
    try {
      const userId = req.user.user_id;
      const { phone, address, emergency_contact_name, emergency_contact } = req.body;

      const query = `
        UPDATE students 
        SET 
          phone = COALESCE($1, phone),
          address = COALESCE($2, address),
          emergency_contact_name = COALESCE($3, emergency_contact_name),
          emergency_contact = COALESCE($4, emergency_contact),
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $5
        RETURNING *
      `;

      const result = await pool.query(query, [
        phone,
        address,
        emergency_contact_name,
        emergency_contact,
        userId
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Update payment window
  async updatePaymentWindow(req, res) {
    try {
      const userId = req.user.user_id;
      const { payment_window } = req.body;

      if (!['monthly', 'quarterly', 'half_yearly', 'yearly'].includes(payment_window)) {
        return res.status(400).json({ error: 'Invalid payment window' });
      }

      const query = `
        UPDATE students 
        SET payment_window = $1, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2
        RETURNING *
      `;

      const result = await pool.query(query, [payment_window, userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating payment window:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Helper function to calculate performance score
  calculatePerformanceScore(student, attendancePercentage) {
    const attendanceScore = attendancePercentage * 0.3;
    const practiceScore = Math.min((student.total_practice_hours / 100) * 100, 100) * 0.2;
    const performanceScore = Math.min((student.total_performances / 5) * 100, 100) * 0.2;
    const examScore = Math.min((student.total_exams_attended / 2) * 100, 100) * 0.2;
    
    const totalScore = attendanceScore + practiceScore + performanceScore + examScore + 10;
    return Math.round(Math.min(totalScore, 100));
  }
};

module.exports = studentController;
