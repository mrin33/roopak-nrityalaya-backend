// Generate Bcrypt Password Hash
// Run this in your backend folder: node generatePassword.js

const bcrypt = require('bcryptjs');

const password = 'password123';

// Generate hash (same as your authController uses)
bcrypt.genSalt(10, (err, salt) => {
  bcrypt.hash(password, salt, (err, hash) => {
    console.log('\n✅ PASSWORD HASH GENERATED!\n');
    console.log('Password:', password);
    console.log('Hash:', hash);
    console.log('Length:', hash.length);
    console.log('\n📋 Copy this SQL and run in pgAdmin:\n');
    console.log(`UPDATE users SET password_hash = '${hash}' WHERE email IN ('admin@roopak.com', 'priya.sharma@roopak.com', 'student1@test.com');`);
    console.log('\nThen try logging in with password123\n');
  });
});
