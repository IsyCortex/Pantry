const pool = require('../src/db/pool');

const timeoutMs = 30000;
const intervalMs = 1000;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      await pool.query('SELECT 1');
      console.log('Database is reachable.');
      await pool.end();
      return;
    } catch (_error) {
      await sleep(intervalMs);
    }
  }

  await pool.end();
  console.error(`Database did not become reachable within ${timeoutMs}ms.`);
  process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});