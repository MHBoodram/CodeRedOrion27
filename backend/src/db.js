const { Pool } = require('pg');

// Newer versions of pg treat sslmode=require in the URL as strict verification
// and override the ssl option below, so strip it and configure SSL explicitly.
const url = new URL(process.env.DATABASE_URL);
url.searchParams.delete('sslmode');

// A local Postgres (dev fallback) has no SSL; hosted databases like Tiger need it.
const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);

const pool = new Pool({
  connectionString: url.toString(),
  ssl: isLocal ? false : { rejectUnauthorized: process.env.DB_SSL_STRICT === 'true' },
  max: 10,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => console.error('Unexpected pg pool error', err));

const query = (text, params) => pool.query(text, params);

async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTx };