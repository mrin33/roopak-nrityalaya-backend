const pool = require('../config/database');

const galleryRequestController = {
  // Create gallery upload request
  async create(req, res) {
    try {
      const userId = req.user.userId;
      const { title, description, media_type, category, file_url } = req.body;

      // Get student_id
      const studentQuery = 'SELECT student_id FROM students WHERE user_id = $1';
      const studentResult = await pool.query(studentQuery, [userId]);
      const studentId = studentResult.rows[0]?.student_id;

      if (!studentId) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const query = `
        INSERT INTO gallery_requests (
          student_id, title, description, media_type, category, file_url, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        RETURNING *
      `;

      const result = await pool.query(query, [
        studentId,
        title,
        description,
        media_type,
        category,
        file_url
      ]);

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating gallery request:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get all requests for student
  async getMyRequests(req, res) {
    try {
      const userId = req.user.userId;

      const query = `
        SELECT gr.*
        FROM gallery_requests gr
        INNER JOIN students s ON gr.student_id = s.student_id
        WHERE s.user_id = $1
        ORDER BY gr.created_at DESC
      `;

      const result = await pool.query(query, [userId]);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching requests:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get all requests (Admin)
  async getAllRequests(req, res) {
    try {
      const { status } = req.query;

      let query = `
        SELECT 
          gr.*,
          s.full_name as student_name,
          s.roll_number
        FROM gallery_requests gr
        INNER JOIN students s ON gr.student_id = s.student_id
      `;

      const values = [];
      if (status && status !== 'all') {
        query += ' WHERE gr.status = $1';
        values.push(status);
      }

      query += ' ORDER BY gr.created_at DESC';

      const result = await pool.query(query, values);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching all requests:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Approve request (Admin)
  async approve(req, res) {
    try {
      const { request_id } = req.params;
      const adminName = req.user.full_name || 'Admin';

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Update request status
        const updateQuery = `
          UPDATE gallery_requests 
          SET 
            status = 'approved',
            reviewed_by = $1,
            reviewed_at = CURRENT_TIMESTAMP
          WHERE request_id = $2
          RETURNING *
        `;
        const result = await client.query(updateQuery, [adminName, request_id]);

        if (result.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Request not found' });
        }

        const request = result.rows[0];

        // Add to gallery table
        await client.query(
          `INSERT INTO gallery (title, description, image_url, category, uploaded_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [request.title, request.description, request.file_url, request.category, 'student']
        );

        await client.query('COMMIT');
        res.json(result.rows[0]);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error approving request:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Reject request (Admin)
  async reject(req, res) {
    try {
      const { request_id } = req.params;
      const { rejection_reason } = req.body;
      const adminName = req.user.full_name || 'Admin';

      const query = `
        UPDATE gallery_requests 
        SET 
          status = 'rejected',
          reviewed_by = $1,
          reviewed_at = CURRENT_TIMESTAMP,
          rejection_reason = $2
        WHERE request_id = $3
        RETURNING *
      `;

      const result = await pool.query(query, [adminName, rejection_reason, request_id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Request not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error rejecting request:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = galleryRequestController;
