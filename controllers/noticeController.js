const pool = require('../config/database');

const noticeController = {
  // Get all published notices (optionally filtered by category and audience)
  getNotices: async (req, res) => {
    try {
      const { category, target_audience } = req.query;
      
      let query = `
        SELECT * FROM notices 
        WHERE status = 'published'
      `;
      const values = [];

      if (category && category !== 'all') {
        values.push(category);
        query += ` AND category = $${values.length}`;
      }

      if (target_audience && target_audience !== 'all') {
        values.push(target_audience);
        query += ` AND (target_audience = 'all' OR target_audience = $${values.length})`;
      }

      query += ` ORDER BY created_at DESC`;

      const result = await pool.query(query, values);
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching notices:', err);
      res.status(500).json({ message: 'Server error while fetching notices' });
    }
  },

  // Admin: Get all notices including drafts
  getAllAdminNotices: async (req, res) => {
    try {
      const query = `SELECT * FROM notices ORDER BY created_at DESC`;
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching admin notices:', err);
      res.status(500).json({ message: 'Server error while fetching admin notices' });
    }
  },

  // Create new notice
  createNotice: async (req, res) => {
    try {
      const { title, content, target_audience, category, is_important, status } = req.body;
      
      const query = `
        INSERT INTO notices 
        (title, content, target_audience, category, is_important, status) 
        VALUES ($1, $2, $3, $4, $5, $6) 
        RETURNING *
      `;
      
      const values = [
        title, 
        content, 
        target_audience || 'all', 
        category || 'general', 
        is_important || false, 
        status || 'published'
      ];

      const result = await pool.query(query, values);
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Error creating notice:', err);
      res.status(500).json({ message: 'Server error while creating notice' });
    }
  },

  // Update notice
  updateNotice: async (req, res) => {
    try {
      const { id } = req.params;
      const { title, content, target_audience, category, is_important, status } = req.body;

      const query = `
        UPDATE notices 
        SET title = $1, content = $2, target_audience = $3, 
            category = $4, is_important = $5, status = $6, updated_at = CURRENT_TIMESTAMP
        WHERE id = $7 
        RETURNING *
      `;
      
      const values = [title, content, target_audience, category, is_important, status, id];
      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Notice not found' });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error updating notice:', err);
      res.status(500).json({ message: 'Server error while updating notice' });
    }
  },

  // Delete notice
  deleteNotice: async (req, res) => {
    try {
      const { id } = req.params;
      
      const query = `DELETE FROM notices WHERE id = $1 RETURNING *`;
      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Notice not found' });
      }

      res.json({ message: 'Notice deleted successfully', deleted: result.rows[0] });
    } catch (err) {
      console.error('Error deleting notice:', err);
      res.status(500).json({ message: 'Server error while deleting notice' });
    }
  }
};

module.exports = noticeController;
