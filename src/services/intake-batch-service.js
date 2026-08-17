const pool = require('../db/pool');
const {
  createManualIntakeBatch,
  replaceDraftBatchItems,
  getDraftBatchById,
  findLatestOpenManualBatch
} = require('../db/intake-batches');
const { normalizeDraftRows } = require('../validation/intake-batch');

function createValidationError(details) {
  const error = new Error('VALIDATION_FAILED');
  error.code = 'VALIDATION_FAILED';
  error.details = details;
  return error;
}

async function ensureManualDraftBatch() {
  const existing = await findLatestOpenManualBatch();
  if (existing) {
    return getManualDraftBatch(existing.id);
  }

  const created = await createManualIntakeBatch();
  return getManualDraftBatch(created.id);
}

async function getManualDraftBatch(batchId) {
  const batch = await getDraftBatchById(batchId);
  if (!batch) {
    return null;
  }

  return {
    id: batch.id,
    state: batch.state,
    sourceType: batch.source_type,
    rows: batch.rows.map((row) => ({
      id: row.id,
      position: row.position,
      name: row.name ?? '',
      quantity: row.quantity ?? '',
      unit: row.unit ?? '',
      location: row.location ?? '',
      expirationDate: row.expiration_date ?? '',
      dateType: row.date_type ?? '',
      accepted: row.accepted !== false
    }))
  };
}

async function saveManualDraftBatch({ batchId, rows }) {
  const validation = normalizeDraftRows(rows);
  if (!validation.valid) {
    throw createValidationError(validation.errors);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let targetBatchId = batchId;
    if (!targetBatchId) {
      const created = await createManualIntakeBatch(client);
      targetBatchId = created.id;
    }

    await replaceDraftBatchItems(targetBatchId, validation.value, client);
    await client.query('COMMIT');
    return getManualDraftBatch(targetBatchId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  ensureManualDraftBatch,
  getManualDraftBatch,
  saveManualDraftBatch
};