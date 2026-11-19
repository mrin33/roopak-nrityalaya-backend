#!/usr/bin/env node
/**
 * Minimal, dependency-free SQL migration runner.
 *
 *   npm run migrate          apply pending migrations
 *   npm run migrate:status   list applied / pending migrations
 *
 * - Migrations are files in db/migrations named NNNN_description.sql and run
 *   in lexical order, each inside its own transaction.
 * - Applied migrations are recorded in public.schema_migrations together with
 *   a SHA-256 checksum; editing an applied migration is reported as an error.
 * - A PostgreSQL advisory lock prevents two runners executing concurrently.
 * - 0001_baseline.sql mirrors the existing production schema. When the
 *   database already contains the application tables, the baseline is
 *   recorded as applied WITHOUT being executed ("adopted").
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../config/database');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const LOCK_KEY = 72616974; // arbitrary constant for pg_advisory_lock
const BASELINE = '0001';

const loadMigrations = () =>
  fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f))
    .sort()
    .map((file) => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8').replace(/\r\n/g, '\n');
      return {
        version: file.slice(0, 4),
        name: file.replace(/\.sql$/, ''),
        sql,
        checksum: crypto.createHash('sha256').update(sql).digest('hex'),
      };
    });

const ensureTable = (client) =>
  client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version    varchar(20) PRIMARY KEY,
      name       varchar(255) NOT NULL,
      checksum   char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      adopted    boolean NOT NULL DEFAULT false
    )`);

const run = async (mode) => {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await ensureTable(client);

    const migrations = loadMigrations();
    const { rows } = await client.query('SELECT version, checksum, adopted FROM public.schema_migrations');
    const applied = new Map(rows.map((r) => [r.version, r]));

    // Detect drift: applied migrations whose file content changed.
    const drift = migrations.filter(
      (m) => applied.has(m.version) && applied.get(m.version).checksum !== m.checksum
    );
    if (drift.length) {
      throw new Error(
        `Applied migrations were modified: ${drift.map((m) => m.name).join(', ')}. ` +
          'Create a new migration instead of editing an applied one.'
      );
    }

    const pending = migrations.filter((m) => !applied.has(m.version));

    if (mode === 'status') {
      for (const m of migrations) {
        const a = applied.get(m.version);
        console.log(`${a ? (a.adopted ? 'adopted ' : 'applied ') : 'PENDING '} ${m.name}`);
      }
      return;
    }

    if (!pending.length) {
      console.log('✅ Database is up to date.');
      return;
    }

    for (const m of pending) {
      if (m.version === BASELINE) {
        const { rows: existing } = await client.query(
          "SELECT to_regclass('public.users') IS NOT NULL AS exists"
        );
        if (existing[0].exists) {
          await client.query(
            'INSERT INTO public.schema_migrations (version, name, checksum, adopted) VALUES ($1, $2, $3, true)',
            [m.version, m.name, m.checksum]
          );
          console.log(`↪  ${m.name}: existing schema detected — adopted without executing.`);
          continue;
        }
      }

      process.stdout.write(`▶  ${m.name} ... `);
      try {
        await client.query('BEGIN');
        await client.query(m.sql);
        await client.query(
          'INSERT INTO public.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
          [m.version, m.name, m.checksum]
        );
        await client.query('COMMIT');
        console.log('done');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.log('FAILED');
        throw new Error(`${m.name}: ${err.message}`);
      }
    }
    console.log('✅ Migrations complete.');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
};

if (require.main === module) {
  const mode = process.argv[2] === 'status' ? 'status' : 'up';
  run(mode)
    .then(() => pool.end())
    .catch(async (err) => {
      console.error(`❌ ${err.message}`);
      await pool.end().catch(() => {});
      process.exit(1);
    });
}

module.exports = { run };
