const pool = require('./pool');

async function createInventoryItem(item, client = pool) {
  const result = await pool.query(
    `INSERT INTO inventory_items (
      name, quantity, unit, location, expiration_date, date_type, source_batch_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, name, quantity, unit, location, expiration_date, date_type, lifecycle_status, source_batch_id, created_at, updated_at, removed_at`,
    [item.name, item.quantity, item.unit, item.location, item.expirationDate, item.dateType, item.sourceBatchId ?? null]
  );

  return result.rows[0];
}

async function getInventoryItemById(id) {
  const result = await pool.query(
    `SELECT id, name, quantity, unit, location, expiration_date, date_type, lifecycle_status, source_batch_id, created_at, updated_at, removed_at
     FROM inventory_items
     WHERE id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

async function listActiveInventoryItems() {
  const result = await pool.query(
    `SELECT id, name, quantity, unit, location,
            expiration_date::text AS expiration_date,
            date_type, lifecycle_status, source_batch_id, created_at, updated_at, removed_at
     FROM inventory_items
     WHERE lifecycle_status = 'active'
     ORDER BY id ASC`
  );

  return result.rows;
}

module.exports = { createInventoryItem, getInventoryItemById, listActiveInventoryItems };