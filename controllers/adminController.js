const pool = require('../config/database');

const adminController = {
  // ==================== DASHBOARD ====================
  
  // Get dashboard stats
  async getDashboard(req, res) {
    try {
      const stats = {};

      // Total students
      const studentsResult = await pool.query(
        "SELECT COUNT(*) as count FROM students WHERE is_active = true"
      );
      stats.total_students = parseInt(studentsResult.rows[0].count);

      // Total teachers
      const teachersResult = await pool.query(
        "SELECT COUNT(*) as count FROM teachers WHERE is_active = true"
      );
      stats.total_teachers = parseInt(teachersResult.rows[0].count);

      // Total batches
      const batchesResult = await pool.query('SELECT COUNT(*) as count FROM batches');
      stats.total_batches = parseInt(batchesResult.rows[0].count);

      // Revenue this month
      const revenueResult = await pool.query(
        `SELECT COALESCE(SUM(amount_paid), 0) as revenue 
         FROM fee_payments 
         WHERE status = 'completed' 
         AND EXTRACT(MONTH FROM payment_date) = EXTRACT(MONTH FROM CURRENT_DATE)
         AND EXTRACT(YEAR FROM payment_date) = EXTRACT(YEAR FROM CURRENT_DATE)`
      );
      stats.monthly_revenue = parseFloat(revenueResult.rows[0].revenue);

      res.json(stats);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // ==================== STUDENT MANAGEMENT ====================

  // Get all students
  async getAllStudents(req, res) {
    try {
      const { level_id, status, payment_window, search } = req.query;

      let query = `
        SELECT 
          s.student_id,
          s.roll_number,
          s.full_name,
          u.email,
          s.phone,
          CASE WHEN s.is_active THEN 'active' ELSE 'inactive' END as status,
          s.payment_window,
          0 as discount,
          l.level_name,
          b.batch_name,
          s.enrollment_date
        FROM students s
        LEFT JOIN users u ON s.user_id = u.user_id
        LEFT JOIN levels l ON s.current_level_id = l.level_id
        LEFT JOIN student_batches sb ON s.student_id = sb.student_id AND sb.is_active = true
        LEFT JOIN batches b ON sb.batch_id = b.batch_id
        WHERE 1=1
      `;

      const values = [];
      let paramCount = 1;

      if (level_id) {
        query += ` AND s.current_level_id = $${paramCount}`;
        values.push(level_id);
        paramCount++;
      }

      if (status) {
        if (status === 'active') {
          query += ` AND s.is_active = true`;
        } else {
          query += ` AND s.is_active = false`;
        }
        paramCount++;
      }

      if (payment_window) {
        query += ` AND s.payment_window = $${paramCount}`;
        values.push(payment_window);
        paramCount++;
      }

      if (search) {
        query += ` AND (s.full_name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
        values.push(`%${search}%`);
        paramCount++;
      }

      query += ' ORDER BY s.full_name';

      const result = await pool.query(query, values);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching students:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // Get student details by ID
  async getStudentDetails(req, res) {
    try {
      const { student_id } = req.params;

      const result = await pool.query(`
        SELECT 
          s.*,
          l.level_name,
          b.batch_name,
          b.schedule,
          t.full_name as teacher_name
        FROM students s
        LEFT JOIN levels l ON s.level_id = l.level_id
        LEFT JOIN batches b ON s.batch_id = b.batch_id
        LEFT JOIN teachers t ON b.teacher_id = t.teacher_id
        WHERE s.student_id = $1
      `, [student_id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Student not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error fetching student details:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // Update student
  async updateStudent(req, res) {
    try {
      const { student_id } = req.params;
      const { full_name, email, phone, level_id, batch_id, payment_window, discount } = req.body;

      const result = await pool.query(`
        UPDATE students 
        SET 
          full_name = COALESCE($1, full_name),
          email = COALESCE($2, email),
          phone = COALESCE($3, phone),
          level_id = COALESCE($4, level_id),
          batch_id = COALESCE($5, batch_id),
          payment_window = COALESCE($6, payment_window),
          discount = COALESCE($7, discount),
          updated_at = NOW()
        WHERE student_id = $8
        RETURNING *
      `, [full_name, email, phone, level_id, batch_id, payment_window, discount, student_id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Student not found' });
      }

      res.json({ message: 'Student updated successfully', student: result.rows[0] });
    } catch (error) {
      console.error('Error updating student:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // Delete student
  async deleteStudent(req, res) {
    try {
      const { student_id } = req.params;

      const result = await pool.query(
        'DELETE FROM students WHERE student_id = $1 RETURNING *',
        [student_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Student not found' });
      }

      res.json({ message: 'Student deleted successfully' });
    } catch (error) {
      console.error('Error deleting student:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // Change student status
  async changeStudentStatus(req, res) {
    try {
      const { student_id } = req.params;
      const { status, reason } = req.body;

      if (!status) {
        return res.status(400).json({ message: 'Status is required' });
      }

      // Begin transaction
      await pool.query('BEGIN');

      // Update student status
      const updateResult = await pool.query(
        'UPDATE students SET status = $1, updated_at = NOW() WHERE student_id = $2 RETURNING *',
        [status, student_id]
      );

      if (updateResult.rows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ message: 'Student not found' });
      }

      // Log status change
      let changeType = 'status_change';
      if (status === 'discontinued') changeType = 'discontinuation';
      if (status === 'suspended') changeType = 'suspension';

      await pool.query(`
        INSERT INTO student_status_changes 
        (student_id, old_status, new_status, change_type, reason, changed_by, changed_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        student_id, 
        updateResult.rows[0].status, 
        status, 
        changeType, 
        reason || null,
        req.user.userId
      ]);

      await pool.query('COMMIT');

      res.json({ 
        message: 'Student status updated successfully', 
        student: updateResult.rows[0] 
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('Error changing student status:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // ==================== TEACHER MANAGEMENT ====================

  // Get all teachers
  async getAllTeachers(req, res) {
    try {
      const result = await pool.query(`
        SELECT 
          t.*,
          COUNT(DISTINCT b.batch_id) as total_batches,
          COUNT(DISTINCT s.student_id) as total_students,
          0 as avg_rating
        FROM teachers t
        LEFT JOIN batches b ON t.teacher_id = b.teacher_id
        LEFT JOIN student_batches sb ON b.batch_id = sb.batch_id AND sb.is_active = true
        LEFT JOIN students s ON sb.student_id = s.student_id AND s.is_active = true
        GROUP BY t.teacher_id
        ORDER BY t.full_name
      `);

      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching teachers:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // Create teacher
  async createTeacher(req, res) {
    try {
      const { 
        email, 
        password, 
        full_name, 
        phone, 
        specialization, 
        experience_years, 
        bio 
      } = req.body;

      if (!email || !password || !full_name) {
        return res.status(400).json({ 
          message: 'Email, password, and full name are required' 
        });
      }

      // Begin transaction
      await pool.query('BEGIN');

      // Create user account
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);

      const userResult = await pool.query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING user_id',
        [email, hashedPassword, 'teacher']
      );

      const userId = userResult.rows[0].user_id;

      // Create teacher profile
      const teacherResult = await pool.query(`
        INSERT INTO teachers 
        (user_id, full_name, phone, specialization, experience_years, bio, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, true)
        RETURNING *
      `, [userId, full_name, phone, specialization, experience_years, bio]);

      await pool.query('COMMIT');

      res.status(201).json({
        message: 'Teacher created successfully',
        teacher: teacherResult.rows[0]
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('Error creating teacher:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // Update teacher
  async updateTeacher(req, res) {
    try {
      const { teacher_id } = req.params;
      const { 
        full_name, 
        email, 
        phone, 
        specialization, 
        experience_years, 
        bio, 
        is_active 
      } = req.body;

      const result = await pool.query(`
        UPDATE teachers 
        SET 
          full_name = COALESCE($1, full_name),
          email = COALESCE($2, email),
          phone = COALESCE($3, phone),
          specialization = COALESCE($4, specialization),
          experience_years = COALESCE($5, experience_years),
          bio = COALESCE($6, bio),
          is_active = COALESCE($7, is_active),
          updated_at = NOW()
        WHERE teacher_id = $8
        RETURNING *
      `, [full_name, email, phone, specialization, experience_years, bio, is_active, teacher_id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Teacher not found' });
      }

      res.json({ 
        message: 'Teacher updated successfully', 
        teacher: result.rows[0] 
      });
    } catch (error) {
      console.error('Error updating teacher:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // Delete teacher
  async deleteTeacher(req, res) {
    try {
      const { teacher_id } = req.params;

      // Check if teacher has active batches
      const batchCheck = await pool.query(
        'SELECT COUNT(*) as count FROM batches WHERE teacher_id = $1',
        [teacher_id]
      );

      if (parseInt(batchCheck.rows[0].count) > 0) {
        return res.status(400).json({ 
          message: 'Cannot delete teacher with assigned batches' 
        });
      }

      const result = await pool.query(
        'DELETE FROM teachers WHERE teacher_id = $1 RETURNING *',
        [teacher_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Teacher not found' });
      }

      res.json({ message: 'Teacher deleted successfully' });
    } catch (error) {
      console.error('Error deleting teacher:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // ==================== BATCH MANAGEMENT ====================

  // Get all batches
  async getAllBatches(req, res) {
    try {
      const result = await pool.query(`
        SELECT 
          b.*,
          l.level_name,
          t.full_name as teacher_name,
          b.current_enrolled
        FROM batches b
        LEFT JOIN levels l ON b.level_id = l.level_id
        LEFT JOIN teachers t ON b.teacher_id = t.teacher_id
        ORDER BY b.batch_name
      `);

      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching batches:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // Create batch
  async createBatch(req, res) {
    try {
      const { 
        batch_name, 
        level_id, 
        teacher_id, 
        schedule, 
        time, 
        room, 
        max_students,
        start_date
      } = req.body;

      if (!batch_name || !level_id || !teacher_id || !schedule || !time) {
        return res.status(400).json({ 
          message: 'batch_name, level_id, teacher_id, schedule, and time are required' 
        });
      }

      const parsedMaxStudents = max_students ? parseInt(max_students, 10) : 15;
      const parsedLevelId = parseInt(level_id, 10);
      const parsedTeacherId = parseInt(teacher_id, 10);

      const result = await pool.query(`
        INSERT INTO batches 
        (batch_name, level_id, teacher_id, schedule, "time", room, max_students, start_date, current_enrolled)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)
        RETURNING *
      `, [batch_name, parsedLevelId, parsedTeacherId, schedule, time, room, parsedMaxStudents, start_date || null]);

      res.status(201).json({
        message: 'Batch created successfully',
        batch: result.rows[0]
      });
    } catch (error) {
      console.error('Error creating batch:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // Update batch
  async updateBatch(req, res) {
    try {
      const { batch_id } = req.params;
      const { 
        batch_name, 
        level_id, 
        teacher_id, 
        schedule, 
        time, 
        room, 
        max_students 
      } = req.body;

      const result = await pool.query(`
        UPDATE batches 
        SET 
          batch_name = COALESCE($1, batch_name),
          level_id = COALESCE($2, level_id),
          teacher_id = COALESCE($3, teacher_id),
          schedule = COALESCE($4, schedule),
          time = COALESCE($5, time),
          room = COALESCE($6, room),
          max_students = COALESCE($7, max_students),
          updated_at = NOW()
        WHERE batch_id = $8
        RETURNING *
      `, [batch_name, level_id, teacher_id, schedule, time, room, max_students, batch_id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Batch not found' });
      }

      res.json({ 
        message: 'Batch updated successfully', 
        batch: result.rows[0] 
      });
    } catch (error) {
      console.error('Error updating batch:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // Delete batch
  async deleteBatch(req, res) {
    try {
      const { batch_id } = req.params;

      // Check if batch has active students
      const studentCheck = await pool.query(
        "SELECT COUNT(*) as count FROM students WHERE batch_id = $1 AND status = 'active'",
        [batch_id]
      );

      if (parseInt(studentCheck.rows[0].count) > 0) {
        return res.status(400).json({ 
          message: 'Cannot delete batch with active students' 
        });
      }

      const result = await pool.query(
        'DELETE FROM batches WHERE batch_id = $1 RETURNING *',
        [batch_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Batch not found' });
      }

      res.json({ message: 'Batch deleted successfully' });
    } catch (error) {
      console.error('Error deleting batch:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // ==================== FEE MANAGEMENT ====================

  // Get all fees
  async getAllFees(req, res) {
    try {
      const { status, month, year } = req.query;

      let query = `
        SELECT 
          fp.*,
          s.roll_number,
          s.full_name as student_name,
          s.payment_window
        FROM fee_payments fp
        INNER JOIN students s ON fp.student_id = s.student_id
        WHERE 1=1
      `;

      const values = [];
      let paramCount = 1;

      if (status) {
        query += ` AND fp.payment_status = $${paramCount}`;
        values.push(status);
        paramCount++;
      }

      if (month && year) {
        query += ` AND EXTRACT(MONTH FROM fp.due_date) = $${paramCount}`;
        values.push(month);
        paramCount++;
        query += ` AND EXTRACT(YEAR FROM fp.due_date) = $${paramCount}`;
        values.push(year);
        paramCount++;
      }

      query += ' ORDER BY fp.due_date DESC';

      const result = await pool.query(query, values);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching fees:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // Record fee payment
  async recordFeePayment(req, res) {
    try {
      const { 
        student_id, 
        amount_paid, 
        payment_method, 
        transaction_id 
      } = req.body;

      if (!student_id || !amount_paid) {
        return res.status(400).json({ 
          message: 'student_id and amount_paid are required' 
        });
      }

      const result = await pool.query(`
        INSERT INTO fee_payments 
        (student_id, amount_paid, payment_status, payment_date, payment_method, transaction_id)
        VALUES ($1, $2, 'paid', NOW(), $3, $4)
        RETURNING *
      `, [student_id, amount_paid, payment_method, transaction_id]);

      res.status(201).json({
        message: 'Fee payment recorded successfully',
        payment: result.rows[0]
      });
    } catch (error) {
      console.error('Error recording fee payment:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // ==================== ANALYTICS ====================

  // Get best teachers
  async getBestTeachers(req, res) {
    try {
      const query = `
        SELECT 
          t.teacher_id,
          t.full_name as name,
          COALESCE(AVG(r.overall_rating), 0) as avg_rating,
          COUNT(DISTINCT s.student_id) as total_students,
          t.experience_years
        FROM teachers t
        LEFT JOIN reviews r ON t.teacher_id = r.teacher_id
        LEFT JOIN batches b ON t.teacher_id = b.teacher_id
        LEFT JOIN students s ON b.batch_id = s.batch_id AND s.status = 'active'
        WHERE t.is_active = true
        GROUP BY t.teacher_id, t.full_name, t.experience_years
        ORDER BY avg_rating DESC, total_students DESC
        LIMIT 3
      `;

      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching best teachers:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // Get best students
  async getBestStudents(req, res) {
    try {
      const query = `
        SELECT 
          s.roll_number,
          s.full_name as name,
          s.total_practice_hours as practice_hours,
          s.total_performances,
          COALESCE(
            (SELECT COUNT(*) FILTER (WHERE status = 'present')::float / 
             NULLIF(COUNT(*)::float, 0) * 100
             FROM attendance 
             WHERE student_id = s.student_id
             AND attendance_date >= CURRENT_DATE - INTERVAL '90 days'
            ), 0
          ) as attendance,
          COALESCE(
            (SELECT AVG(overall_rating) * 20
             FROM reviews 
             WHERE student_id = s.student_id
            ), 0
          ) as performance_score
        FROM students s
        WHERE s.status = 'active'
        ORDER BY performance_score DESC, attendance DESC
        LIMIT 10
      `;

      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching best students:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // Get enrollment trends
  async getEnrollmentTrends(req, res) {
    try {
      const query = `
        SELECT 
          TO_CHAR(enrollment_date, 'Mon YYYY') as month,
          COUNT(*) as enrolled
        FROM students
        WHERE enrollment_date >= CURRENT_DATE - INTERVAL '5 months'
        GROUP BY TO_CHAR(enrollment_date, 'Mon YYYY'), DATE_TRUNC('month', enrollment_date)
        ORDER BY DATE_TRUNC('month', enrollment_date)
      `;

      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching enrollment trends:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // Get discontinuation reasons
  async getDiscontinuationReasons(req, res) {
    try {
      const query = `
        SELECT 
          reason,
          COUNT(*) as count
        FROM student_status_changes
        WHERE change_type = 'discontinuation'
        GROUP BY reason
        ORDER BY count DESC
      `;

      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching discontinuation reasons:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // ==================== STATUS CHANGES ====================

  // Get status changes
  async getStatusChanges(req, res) {
    try {
      const { change_type } = req.query;

      let query = `
        SELECT 
          sc.*,
          s.full_name as student_name,
          s.roll_number
        FROM student_status_changes sc
        INNER JOIN students s ON sc.student_id = s.student_id
      `;

      const values = [];
      if (change_type && change_type !== 'all') {
        query += ' WHERE sc.change_type = $1';
        values.push(change_type);
      }

      query += ' ORDER BY sc.changed_at DESC';

      const result = await pool.query(query, values);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching status changes:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // ==================== NOTICES ====================

  // Get all notices
  async getAllNotices(req, res) {
    try {
      const result = await pool.query(`
        SELECT * FROM notices
        ORDER BY created_at DESC
      `);

      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching notices:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // Create notice
  async createNotice(req, res) {
    try {
      const { title, content, priority = 'normal', target_audience = 'all' } = req.body;

      if (!title || !content) {
        return res.status(400).json({ message: 'Title and content are required' });
      }

      const result = await pool.query(`
        INSERT INTO notices (title, content, priority, target_audience, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [title, content, priority, target_audience, req.user.userId]);

      res.status(201).json({
        message: 'Notice created successfully',
        notice: result.rows[0]
      });
    } catch (error) {
      console.error('Error creating notice:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // Update notice
  async updateNotice(req, res) {
    try {
      const { notice_id } = req.params;
      const { title, content, priority, target_audience } = req.body;

      const result = await pool.query(`
        UPDATE notices 
        SET 
          title = COALESCE($1, title),
          content = COALESCE($2, content),
          priority = COALESCE($3, priority),
          target_audience = COALESCE($4, target_audience),
          updated_at = NOW()
        WHERE notice_id = $5
        RETURNING *
      `, [title, content, priority, target_audience, notice_id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Notice not found' });
      }

      res.json({ 
        message: 'Notice updated successfully', 
        notice: result.rows[0] 
      });
    } catch (error) {
      console.error('Error updating notice:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },

  // Delete notice
  async deleteNotice(req, res) {
    try {
      const { notice_id } = req.params;

      const result = await pool.query(
        'DELETE FROM notices WHERE notice_id = $1 RETURNING *',
        [notice_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Notice not found' });
      }

      res.json({ message: 'Notice deleted successfully' });
    } catch (error) {
      console.error('Error deleting notice:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
};

module.exports = adminController;
