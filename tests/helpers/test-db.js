const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

// Load .env exactly like src/config.js so the isolation guard compares the
// same DATABASE_URL value the application would use.
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const DEFAULT_DEV_URL = 'postgres://pantry:pantry@127.0.0.1:15432/pantry';
const DEFAULT_TEST_URL = 'postgres://pantry:pantry@127.0.0.1:15432/pantry_test';

const testDatabaseUrl = process.env.TEST_DATABASE_URL || DEFAULT_TEST_URL;

function assertIsolatedTestDatabase() {
  const developmentUrls = [process.env.DATABASE_URL, DEFAULT_DEV_URL].filter(Boolean);
  if (developmentUrls.includes(testDatabaseUrl)) {
    throw new Error(
      'Refusing to run tests against the development database. ' +
      `TEST_DATABASE_URL must point at the dedicated test database (default: ${DEFAULT_TEST_URL}).`
    );
  }
}

async function createTestDatabaseIfMissing() {
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
  if (!databaseName) {
    throw new Error(`TEST_DATABASE_URL does not contain a database name: ${testDatabaseUrl}`);
  }

  const adminUrl = new URL(testDatabaseUrl);
  adminUrl.pathname = '/postgres';

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${databaseName}"`);
  } catch (error) {
    // 42P04 duplicate_database: the test database already exists.
    if (error.code !== '42P04') {
      throw error;
    }
  } finally {
    await client.end();
  }
}

async function applyMigrationsToTestDatabase() {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const appliedResult = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(appliedResult.rows.map((row) => row.filename));

    const migrationsDir = path.resolve(__dirname, '..', '..', 'migrations');
    const filenames = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();

    for (const filename of filenames) {
      if (applied.has(filename)) {
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

assertIsolatedTestDatabase();

// Redirect the shared application pool to the isolated test database before
// any other module in this process loads src/db/pool.
process.env.DATABASE_URL = testDatabaseUrl;

const pool = require('../../src/db/pool');

let preparePromise = null;

function prepareTestDatabase() {
  if (!preparePromise) {
    preparePromise = (async () => {
      await createTestDatabaseIfMissing();
      await applyMigrationsToTestDatabase();
    })();
  }

  return preparePromise;
}

async function resetAllTables() {
  await prepareTestDatabase();
  await pool.query('TRUNCATE TABLE inventory_items, intake_batch_items, intake_batches RESTART IDENTITY CASCADE');
}

module.exports = { pool, resetAllTables };