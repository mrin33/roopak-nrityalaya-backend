const pool = require('../config/database');

const batchTransferController = {
  // Get teacher's transfers
  async getMyTransfers(req, res) {
    try {
      const userId = req.user.userId;

      const query = `
        SELECT 
          bt.*,
          b.batch_name,
          t.full_name as substitute_teacher_name
        FROM batch_transfers bt
        INNER JOIN teachers orig_t ON bt.original_teacher_id = orig_t.teacher_id
        INNER JOIN batches b ON bt.batch_id = b.batch_id
        INNER JOIN teachers t ON bt.substitute_teacher_id = t.teacher_id
        WHERE orig_t.user_id = $1
        ORDER BY bt.transfer_date DESC
      `;

      const result = await pool.query(query, [userId]);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching transfers:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Create transfer
  async create(req, res) {
    try {
      const userId = req.user.userId;
      const { batch_id, substitute_teacher_id, transfer_date, reason } = req.body;

      // Get teacher_id
      const teacherQuery = 'SELECT teacher_id FROM teachers WHERE user_id = $1';
      const teacherResult = await pool.query(teacherQuery, [userId]);
      const teacherId = teacherResult.rows[0]?.teacher_id;

      if (!teacherId) {
        return res.status(404).json({ error: 'Teacher not found' });
      }

      const query = `
        INSERT INTO batch_transfers (
          batch_id, original_teacher_id, substitute_teacher_id, 
          transfer_date, reason, status
        )
        VALUES ($1, $2, $3, $4, $5, 'active')
        RETURNING *
      `;

      const result = await pool.query(query, [
        batch_id,
        teacherId,
        substitute_teacher_id,
        transfer_date,
        reason
      ]);

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating transfer:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get available teachers
  async getAvailableTeachers(req, res) {
    try {
      const userId = req.user.userId;

      const query = `
        SELECT teacher_id, full_name, specialization
        FROM teachers
        WHERE user_id != $1 AND status = 'active'
        ORDER BY full_name
      `;

      const result = await pool.query(query, [userId]);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching teachers:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = batchTransferController;
