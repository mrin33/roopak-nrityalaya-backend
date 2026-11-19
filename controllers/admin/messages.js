const pool = require('../../config/database');
const AppError = require('../../utils/AppError');
const { pageClause, sendPage } = require('../../utils/pagination');

// Admin messages handlers; aggregated by controllers/adminController.js.
module.exports = {
  async getContactMessages(req, res) {
    const { limit, offset } = req.validatedQuery || {};
    const values = [];
    const { rows } = await pool.query(
      'SELECT *, COUNT(*) OVER() AS total_count FROM contact_messages ORDER BY is_read, created_at DESC ' + pageClause(values, { limit, offset }),
      values
    );
    sendPage(res, rows);
  },

  async updateContactMessage(req, res) {
    const { rows } = await pool.query(
      'UPDATE contact_messages SET is_read = $1 WHERE message_id = $2 RETURNING *',
      [req.body.is_read, req.params.message_id]
    );
    if (!rows.length) throw AppError.notFound('Message not found');
    res.json({ message: 'Message updated', contactMessage: rows[0] });
  },

  async deleteContactMessage(req, res) {
    const { rowCount } = await pool.query('DELETE FROM contact_messages WHERE message_id = $1', [
      req.params.message_id,
    ]);
    if (!rowCount) throw AppError.notFound('Message not found');
    res.json({ message: 'Message deleted' });
  }
};
