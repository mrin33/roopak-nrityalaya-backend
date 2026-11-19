const pool = require('../config/database');

const galleryRequestController = {
  // Student: create a new upload request
  createRequest: async (req, res) => {
    try {
      const student_id = req.user.user_id; // from auth middleware
      const { title, description, media_type, category } = req.body;
      
      let file_url = null;
      if (req.file) {
        // Return relative path to be served statically
        file_url = `/uploads/${req.file.filename}`;
      } else {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const query = `
        INSERT INTO gallery_requests 
        (student_id, title, description, media_type, category, status, file_url)
        VALUES ($1, $2, $3, $4, $5, 'pending', $6)
        RETURNING *
      `;
      const values = [student_id, title, description, media_type, category, file_url];
      
      const result = await pool.query(query, values);
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Error creating gallery request:', err);
      res.status(500).json({ message: 'Server error parsing request' });
    }
  },

  // Student: Get their own requests
  getStudentRequests: async (req, res) => {
    try {
      const student_id = req.user.user_id;
      const query = `
        SELECT * FROM gallery_requests 
        WHERE student_id = $1 
        ORDER BY requested_at DESC
      `;
      const result = await pool.query(query, [student_id]);
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching student gallery requests:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // Admin: Get all requests across all students with student info
  getAllRequests: async (req, res) => {
    try {
      const query = `
        SELECT r.*, s.full_name as student_name, s.roll_number, 
               u.full_name as reviewed_by_name
        FROM gallery_requests r
        JOIN user_profiles s ON r.student_id = s.user_id
        LEFT JOIN user_profiles u ON r.reviewed_by = u.user_id
        ORDER BY r.requested_at DESC
      `;
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching admin gallery requests:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // Admin: Review a request (approve/reject)
  updateRequestStatus: async (req, res) => {
    try {
      const admin_id = req.user.user_id;
      const { id } = req.params;
      const { status, rejection_reason } = req.body; // 'approved' or 'rejected'

      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }

      const query = `
        UPDATE gallery_requests
        SET status = $1, rejection_reason = $2, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $3
        WHERE id = $4
        RETURNING *
      `;
      const values = [status, rejection_reason || null, admin_id, id];
      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Request not found' });
      }

      res.json({ message: 'Status updated successfully', request: result.rows[0] });
    } catch (err) {
      console.error('Error updating gallery request status:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
};

module.exports = galleryRequestController;
