const pool = require('./config/database');
const User = require('./models/User');

async function test() {
  try {
    const teachers = await pool.query("SELECT user_id FROM users WHERE role = 'teacher'");
    for (let row of teachers.rows) {
      const dbProfile = await User.getUserWithProfile(row.user_id);
      console.log(`User ID: ${row.user_id}`, JSON.stringify(dbProfile, null, 2));
    }
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
test();
