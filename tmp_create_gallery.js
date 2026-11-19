const pool = require('./config/database');

async function createTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS gallery_requests (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        media_type VARCHAR(50) DEFAULT 'photo',
        category VARCHAR(100),
        status VARCHAR(50) DEFAULT 'pending',
        file_url TEXT,
        rejection_reason TEXT,
        requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP WITH TIME ZONE,
        reviewed_by INTEGER REFERENCES users(user_id)
    );
  `;
  try {
    await pool.query(query);
    console.log("Table 'gallery_requests' created successfully.");
  } catch (err) {
    console.error("Error creating table:", err);
  } finally {
    pool.end();
  }
}
createTable();
