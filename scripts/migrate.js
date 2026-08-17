const fs = require('fs');
const path = require('path');
const pool = require('../src/db/pool');

async function ensureTrackingTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations() {
  const result = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
  return new Set(result.rows.map((row) => row.filename));
}

async function applyMigration(filename, sql) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    await client.query('COMMIT');
    console.log(`Applied migration: ${filename}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const migrationsDir = path.resolve(__dirname, '..', 'migrations');
  const filenames = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
  await ensureTrackingTable();
  const applied = await getAppliedMigrations();

  for (const filename of filenames) {
    if (applied.has(filename)) {
      console.log(`Skipping already applied migration: ${filename}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    await applyMigration(filename, sql);
  }

  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});