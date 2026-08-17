const pool = require('./pool');

async function checkDatabase() {
  const result = await pool.query('SELECT 1 AS ok');
  return result.rows[0].ok === 1;
}

module.exports = { checkDatabase };