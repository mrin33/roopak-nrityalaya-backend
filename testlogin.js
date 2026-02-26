const bcrypt = require('bcryptjs');
const pool = require('./config/database');

async function testLogin() {
  try {
    // Get user from database
    const result = await pool.query(
      'SELECT email, password_hash FROM users WHERE email = $1',
      ['admin@roopak.com']
    );
    
    if (result.rows.length === 0) {
      console.log('❌ User not found!');
      return;
    }
    
    const user = result.rows[0];
    console.log('✅ User found:', user.email);
    console.log('📋 Hash from DB:', user.password_hash);
    console.log('📏 Hash length:', user.password_hash.length);
    
    // Test password
    const testPassword = 'password123';
    const isMatch = await bcrypt.compare(testPassword, user.password_hash);
    
    console.log('\n🔐 Testing password:', testPassword);
    console.log(isMatch ? '✅ PASSWORD MATCHES!' : '❌ PASSWORD DOES NOT MATCH!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testLogin();