const { Pool, types } = require('pg');
const { db } = require('./env');

// Return DATE columns as plain 'YYYY-MM-DD' strings. By default pg turns
// them into JS Dates at server-local midnight, which serialise to UTC and
// shift calendar dates by a day depending on the server/browser time zone.
types.setTypeParser(1082, (value) => value);

const pool = new Pool({
  connectionString: db.connectionString,
  host: db.connectionString ? undefined : db.host,
  port: db.connectionString ? undefined : db.port,
  user: db.connectionString ? undefined : db.user,
  password: db.connectionString ? undefined : db.password,
  database: db.connectionString ? undefined : db.database,
  ssl: db.ssl ? { rejectUnauthorized: false } : undefined,
  max: db.max,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// An error on an idle client (e.g. the DB restarted) must not crash the
// whole API: the pool discards the broken client and creates a new one.
pool.on('error', (err) => {
  console.error('PostgreSQL idle client error:', err.message);
});

/**
 * Run `fn(client)` inside a single transaction on ONE acquired connection.
 * Commits when fn resolves, rolls back when it throws, always releases.
 */
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr.message);
    }
    throw err;
  } finally {
    client.release();
  }
};

module.exports = pool;
module.exports.pool = pool;
module.exports.withTransaction = withTransaction;
