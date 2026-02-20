const pool = require('../config/database');

const makeupClassController = {
  // Get missed classes for student
  async getMissedClasses(req, res) {
    try {
      const userId = req.user.user_id;

      const query = `
        SELECT 
          a.attendance_id,
          a.attendance_date as class_date,
          b.batch_name,
          b.time,
          t.full_name as teacher_name,
          CASE 
            WHEN EXISTS (
              SELECT 1 FROM makeup_class_requests mcr
              WHERE mcr.original_attendance_id = a.attendance_id
            ) THEN false
            ELSE true
          END as can_request_makeup
        FROM attendance a
        INNER JOIN students s ON a.student_id = s.student_id
        INNER JOIN batches b ON a.batch_id = b.batch_id
        INNER JOIN teachers t ON b.teacher_id = t.teacher_id
        WHERE s.user_id = $1
        AND a.status = 'absent'
        ORDER BY a.attendance_date DESC
      `;

      const result = await pool.query(query, [userId]);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching missed classes:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Create makeup request
  async create(req, res) {
    try {
      const userId = req.user.user_id;
      const { original_attendance_id, makeup_batch_id, makeup_class_date, notes } = req.body;

      // Get student_id
      const studentQuery = 'SELECT student_id, level_id FROM students WHERE user_id = $1';
      const studentResult = await pool.query(studentQuery, [userId]);
      const { student_id, level_id } = studentResult.rows[0];

      if (!student_id) {
        return res.status(404).json({ error: 'Student not found' });
      }

      // Verify makeup batch is same level
      const batchQuery = 'SELECT level_id FROM batches WHERE batch_id = $1';
      const batchResult = await pool.query(batchQuery, [makeup_batch_id]);
      
      if (batchResult.rows[0].level_id !== level_id) {
        return res.status(400).json({ error: 'Makeup batch must be of the same level' });
      }

      const query = `
        INSERT INTO makeup_class_requests (
          student_id, original_attendance_id, makeup_batch_id, 
          makeup_class_date, notes, status
        )
        VALUES ($1, $2, $3, $4, $5, 'pending')
        RETURNING *
      `;

      const result = await pool.query(query, [
        student_id,
        original_attendance_id,
        makeup_batch_id,
        makeup_class_date,
        notes
      ]);

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating makeup request:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get student's makeup requests
  async getMyRequests(req, res) {
    try {
      const userId = req.user.user_id;

      const query = `
        SELECT 
          mcr.*,
          ob.batch_name as original_batch_name,
          oa.attendance_date as original_class_date,
          mb.batch_name as makeup_batch_name,
          mb.time as makeup_time
        FROM makeup_class_requests mcr
        INNER JOIN students s ON mcr.student_id = s.student_id
        INNER JOIN attendance oa ON mcr.original_attendance_id = oa.attendance_id
        INNER JOIN batches ob ON oa.batch_id = ob.batch_id
        INNER JOIN batches mb ON mcr.makeup_batch_id = mb.batch_id
        WHERE s.user_id = $1
        ORDER BY mcr.created_at DESC
      `;

      const result = await pool.query(query, [userId]);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching makeup requests:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Approve/Reject request (Teacher/Admin)
  async updateStatus(req, res) {
    try {
      const { request_id } = req.params;
      const { status, rejection_reason } = req.body;
      const approverName = req.user.full_name;

      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const query = `
        UPDATE makeup_class_requests 
        SET 
          status = $1,
          approved_by = $2,
          rejection_reason = $3,
          reviewed_at = CURRENT_TIMESTAMP
        WHERE request_id = $4
        RETURNING *
      `;

      const result = await pool.query(query, [
        status,
        approverName,
        rejection_reason,
        request_id
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Request not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating makeup request:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = makeupClassController;
