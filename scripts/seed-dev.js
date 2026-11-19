#!/usr/bin/env node
/**
 * Development-only demo data (replaces the removed public /api/seed route).
 * Refuses to run when NODE_ENV=production. The password is never hardcoded:
 *
 *   SEED_PASSWORD='Demo-pass1' npm run seed:dev
 *
 * Creates (if missing): admin@test.com, teacher@test.com, student@test.com,
 * one batch, and enrols the student in it.
 */
const { pool, withTransaction } = require('../config/database');
const { isProduction } = require('../config/env');
const { password: passwordSchema } = require('../validators/common');
const { hashPassword } = require('../utils/security');

(async () => {
  if (isProduction) throw new Error('seed:dev must not be run in production.');
  const parsed = passwordSchema.safeParse(process.env.SEED_PASSWORD || '');
  if (!parsed.success) throw new Error(`SEED_PASSWORD: ${parsed.error.issues[0].message}`);
  const hash = await hashPassword(parsed.data);

  await withTransaction(async (client) => {
    const upsertUser = async (email, role) => {
      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, role, is_active, password_changed_at)
         VALUES ($1, $2, $3, true, now())
         ON CONFLICT (email) DO NOTHING RETURNING user_id`,
        [email, hash, role]
      );
      if (rows.length) return { id: rows[0].user_id, created: true };
      const { rows: existing } = await client.query('SELECT user_id FROM users WHERE email = $1', [email]);
      return { id: existing[0].user_id, created: false };
    };

    await upsertUser('admin@test.com', 'admin');

    const teacher = await upsertUser('teacher@test.com', 'teacher');
    if (teacher.created) {
      await client.query(
        `INSERT INTO teachers (user_id, full_name, phone, specialization, experience_years, is_senior, bio)
         VALUES ($1, 'Priya Sharma', '9876543210', 'Lucknow Gharana', 15, true,
                 'Expert Kathak teacher with 15 years of experience in Lucknow Gharana style.')`,
        [teacher.id]
      );
    }

    const student = await upsertUser('student@test.com', 'student');
    if (student.created) {
      await client.query(
        `INSERT INTO students (user_id, full_name, phone, current_level_id)
         VALUES ($1, 'Asha Patil', '9123456780', (SELECT level_id FROM levels WHERE level_code = 'PP'))`,
        [student.id]
      );
    }

    await client.query(
      `INSERT INTO batches (batch_name, level_id, teacher_id, schedule, "time", room, max_students)
       SELECT 'Demo Evening Batch', l.level_id, t.teacher_id, 'Mon, Wed, Fri', '5:00 PM - 6:30 PM', 'Studio 1', 15
         FROM levels l, teachers t JOIN users u ON u.user_id = t.user_id
        WHERE l.level_code = 'PP' AND u.email = 'teacher@test.com'
          AND NOT EXISTS (SELECT 1 FROM batches WHERE batch_name = 'Demo Evening Batch')`
    );
    await client.query(
      `INSERT INTO student_batches (student_id, batch_id)
       SELECT s.student_id, b.batch_id
         FROM students s JOIN users u ON u.user_id = s.user_id, batches b
        WHERE u.email = 'student@test.com' AND b.batch_name = 'Demo Evening Batch'
       ON CONFLICT (student_id, batch_id) DO NOTHING`
    );
  });
  console.log('✅ Demo data ready: admin@test.com, teacher@test.com, student@test.com (password = SEED_PASSWORD)');
})()
  .catch((err) => {
    console.error(`❌ ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
