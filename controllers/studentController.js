const pool = require('../config/database');

const studentController = {
  // Get student profile
  async getProfile(req, res) {
    try {
      const userId = req.user.userId;

      const query = `
        SELECT 
          s.*,
          l.level_name,
          l.level_code,
          l.level_number,
          u.email,
          b.batch_name,
          b.schedule,
          b."time",
          t.full_name as teacher_name
        FROM students s
        LEFT JOIN levels l ON s.current_level_id = l.level_id
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
      const userId = req.user.userId;

      // Get student
      const studentQuery = `
        SELECT 
          s.student_id,
          s.roll_number,
          s.full_name,
          s.payment_window,
          s.current_level_id,
          l.level_name,
          l.level_number,
          b.batch_name,
          b.schedule,
          t.full_name as teacher_name
        FROM students s
        LEFT JOIN levels l ON s.current_level_id = l.level_id
        LEFT JOIN student_batches sb ON s.student_id = sb.student_id AND sb.is_active = true
        LEFT JOIN batches b ON sb.batch_id = b.batch_id
        LEFT JOIN teachers t ON b.teacher_id = t.teacher_id
        WHERE s.user_id = $1
      `;
      const studentResult = await pool.query(studentQuery, [userId]);
      const student = studentResult.rows[0];

      if (!student) {
        return res.status(404).json({ 
          success: false, 
          error: 'Student not found' 
        });
      }

      // Calculate attendance percentage (last 30 days)
      const attendanceQuery = `
        SELECT 
          COUNT(*) as total_classes,
          COUNT(*) FILTER (WHERE status = 'present') as present_count
        FROM attendance
        WHERE student_id = $1
        AND attendance_date >= CURRENT_DATE - INTERVAL '30 days'
      `;
      const attendanceResult = await pool.query(attendanceQuery, [student.student_id]);
      const attendance = attendanceResult.rows[0];
      const attendancePercentage = attendance.total_classes > 0 
        ? Math.round((attendance.present_count / attendance.total_classes) * 100)
        : 0;

      // Get current payment status
      const feeQuery = `
        SELECT 
          status as payment_status,
          due_date,
          late_fee_applied as late_fee,
          total_amount as final_amount
        FROM fee_payments
        WHERE student_id = $1
        ORDER BY due_date DESC
        LIMIT 1
      `;
      const feeResult = await pool.query(feeQuery, [student.student_id]);
      const feeInfo = feeResult.rows[0] || {
        payment_status: 'paid',
        due_date: null,
        late_fee: 0,
        final_amount: 0
      };

      // Get recent notices
      const noticesQuery = `
        SELECT notice_id as id, title, created_at as date
        FROM notices
        WHERE is_active = true
        ORDER BY created_at DESC
        LIMIT 5
      `;
      const noticesResult = await pool.query(noticesQuery);

      // Return dashboard data
      res.json({
        full_name: student.full_name,
        attendancePercentage: attendancePercentage,
        feeStatus: feeInfo.payment_status || 'paid',
        roll_number: student.roll_number,
        payment_window: student.payment_window,
        discount: 0, // Not stored in students table, set to 0
        next_due_date: feeInfo.due_date,
        has_late_fee: (feeInfo.late_fee || 0) > 0,
        late_fee_amount: feeInfo.late_fee || 0,
        performance_score: 85, // TODO: Calculate from total_performances
        current_level_id: student.current_level_id || 1,
        batchInfo: student.batch_name ? {
          batchName: student.batch_name,
          schedule: student.schedule,
          teacherName: student.teacher_name
        } : null,
        recentNotices: noticesResult.rows,
        upcomingClasses: []
      });

    } catch (error) {
      console.error('Error fetching student dashboard:', error);
      res.status(500).json({ 
        success: false,
        error: 'Server error', 
        message: error.message 
      });
    }
  },

  // Update profile
  async updateProfile(req, res) {
    try {
      const userId = req.user.userId;
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
      const userId = req.user.userId;
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