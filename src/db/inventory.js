const pool = require('./pool');

async function createInventoryItem(item, client = pool) {
  const result = await client.query(
    `INSERT INTO inventory_items (
      name, quantity, unit, location, expiration_date, date_type, source_batch_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, name, quantity, unit, location, expiration_date, date_type, lifecycle_status, source_batch_id, created_at, updated_at, removed_at`,
    [item.name, item.quantity, item.unit, item.location, item.expirationDate, item.dateType, item.sourceBatchId ?? null]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    id: Number(row.id),
    source_batch_id: row.source_batch_id == null ? null : Number(row.source_batch_id)
  };
}

async function getInventoryItemById(id) {
  const result = await pool.query(
    `SELECT id, name, quantity, unit, location, expiration_date, date_type, lifecycle_status, source_batch_id, created_at, updated_at, removed_at
     FROM inventory_items
     WHERE id = $1`,
    [id]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    id: Number(row.id),
    source_batch_id: row.source_batch_id == null ? null : Number(row.source_batch_id)
  };
}

async function updateInventoryItem(id, item, client = pool) {
  const result = await client.query(
    `UPDATE inventory_items
     SET name = $2,
         quantity = $3,
         unit = $4,
         location = $5,
         expiration_date = $6,
         date_type = $7,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, quantity, unit, location, expiration_date, date_type, lifecycle_status, source_batch_id, created_at, updated_at, removed_at`,
    [id, item.name, item.quantity, item.unit, item.location, item.expirationDate, item.dateType]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    id: Number(row.id),
    source_batch_id: row.source_batch_id == null ? null : Number(row.source_batch_id)
  };
}

async function transitionInventoryLifecycle(id, lifecycleStatus, client = pool) {
  const result = await client.query(
    `UPDATE inventory_items
     SET lifecycle_status = $2,
         removed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, quantity, unit, location, expiration_date, date_type, lifecycle_status, source_batch_id, created_at, updated_at, removed_at`,
    [id, lifecycleStatus]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    id: Number(row.id),
    source_batch_id: row.source_batch_id == null ? null : Number(row.source_batch_id)
  };
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

module.exports = {
  createInventoryItem,
  getInventoryItemById,
  updateInventoryItem,
  transitionInventoryLifecycle,
  listActiveInventoryItems
};