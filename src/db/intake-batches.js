const pool = require('./pool');

async function createManualIntakeBatch(client = pool) {
  const result = await client.query(
    `INSERT INTO intake_batches (source_type, state)
     VALUES ('manual', 'draft')
     RETURNING id, source_type, state, created_at, confirmed_at`
  );

  return result.rows[0];
}

async function replaceDraftBatchItems(batchId, rows, client = pool) {
  await client.query('DELETE FROM intake_batch_items WHERE batch_id = $1', [batchId]);

  for (const row of rows) {
    await client.query(
      `INSERT INTO intake_batch_items (
        batch_id, position, name, quantity, unit, location, expiration_date, date_type, attention_reasons, accepted
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '[]'::jsonb, $9)`,
      [batchId, row.position, row.name, row.quantity, row.unit, row.location, row.expirationDate, row.dateType, row.accepted]
    );
  }
}

async function getDraftBatchById(batchId, client = pool) {
  const batchResult = await client.query(
    `SELECT id, source_type, state, created_at, confirmed_at
     FROM intake_batches
     WHERE id = $1`,
    [batchId]
  );

  const batch = batchResult.rows[0];
  if (!batch) {
    return null;
  }

  const itemResult = await client.query(
    `SELECT id, batch_id, position, name, quantity, unit, location,
            expiration_date::text AS expiration_date,
            date_type, attention_reasons, accepted
     FROM intake_batch_items
     WHERE batch_id = $1
     ORDER BY position ASC, id ASC`,
    [batchId]
  );

  return {
    ...batch,
    rows: itemResult.rows
  };
}

async function getBatchForConfirmation(batchId, client = pool) {
  const batchResult = await client.query(
    `SELECT id, source_type, state, created_at, confirmed_at
     FROM intake_batches
     WHERE id = $1
     FOR UPDATE`,
    [batchId]
  );

  const batch = batchResult.rows[0];
  if (!batch) {
    return null;
  }

  const itemResult = await client.query(
    `SELECT id, batch_id, position, name, quantity, unit, location,
            expiration_date::text AS expiration_date,
            date_type, attention_reasons, accepted
     FROM intake_batch_items
     WHERE batch_id = $1
     ORDER BY position ASC, id ASC`,
    [batchId]
  );

  return {
    ...batch,
    rows: itemResult.rows
  };
}

async function findLatestOpenManualBatch(client = pool) {
  const result = await client.query(
    `SELECT id, source_type, state, created_at, confirmed_at
     FROM intake_batches
     WHERE source_type = 'manual' AND state = 'draft'
     ORDER BY id DESC
     LIMIT 1`
  );

  return result.rows[0] || null;
}

async function updateBatchState(batchId, state, client = pool) {
  const result = await client.query(
    `UPDATE intake_batches
     SET state = $2
     WHERE id = $1
     RETURNING id, source_type, state, created_at, confirmed_at`,
    [batchId, state]
  );

  return result.rows[0] || null;
}

async function setBatchConfirmed(batchId, client = pool) {
  const result = await client.query(
    `UPDATE intake_batches
     SET state = 'confirmed', confirmed_at = NOW()
     WHERE id = $1 AND state = 'pending_review'
     RETURNING id, source_type, state, created_at, confirmed_at`,
    [batchId]
  );

  return result.rows[0] || null;
}

module.exports = {
  createManualIntakeBatch,
  replaceDraftBatchItems,
  getDraftBatchById,
  getBatchForConfirmation,
  findLatestOpenManualBatch,
  updateBatchState,
  setBatchConfirmed
};