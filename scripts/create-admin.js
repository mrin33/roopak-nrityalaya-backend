#!/usr/bin/env node
/**
 * Create (or reset the password of) an administrator account.
 * Replaces the removed public /api/seed endpoint and generatePassword.js.
 *
 *   ADMIN_EMAIL=owner@example.com ADMIN_PASSWORD='S3cure-pass' npm run create-admin
 *   npm run create-admin -- --email owner@example.com      (prompts for the password)
 *   add --reset to change the password of an existing admin
 */
const readline = require('readline');
const { pool } = require('../config/database');
const { password: passwordSchema, email: emailSchema } = require('../validators/common');
const { hashPassword } = require('../utils/security');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const ask = (question) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });

(async () => {
  const email = emailSchema.parse(arg('email') || process.env.ADMIN_EMAIL || (await ask('Admin email: ')));
  const rawPassword = process.env.ADMIN_PASSWORD || (await ask('Password (min 8 chars, letters + numbers): '));
  const parsed = passwordSchema.safeParse(rawPassword);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const reset = process.argv.includes('--reset');

  const hash = await hashPassword(parsed.data);
  const { rows } = await pool.query('SELECT user_id, role FROM users WHERE lower(email) = lower($1)', [email]);

  if (rows.length) {
    if (rows[0].role !== 'admin') throw new Error('That email belongs to a non-admin account.');
    if (!reset) throw new Error('Admin already exists. Re-run with --reset to change its password.');
    await pool.query(
      'UPDATE users SET password_hash = $1, password_changed_at = now(), is_active = true WHERE user_id = $2',
      [hash, rows[0].user_id]
    );
    console.log(`✅ Password reset for admin ${email}`);
  } else {
    await pool.query(
      `INSERT INTO users (email, password_hash, role, is_active, password_changed_at)
       VALUES (lower($1), $2, 'admin', true, now())`,
      [email, hash]
    );
    console.log(`✅ Admin created: ${email}`);
  }
})()
  .catch((err) => {
    console.error(`❌ ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
