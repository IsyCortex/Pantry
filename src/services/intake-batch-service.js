const pool = require('../db/pool');
const {
  createManualIntakeBatch,
  replaceDraftBatchItems,
  getDraftBatchById,
  getBatchForConfirmation,
  findLatestOpenManualBatch,
  updateBatchState,
  setBatchConfirmed
} = require('../db/intake-batches');
const { normalizeDraftRows, hasValue } = require('../validation/intake-batch');
const { createConfirmedInventoryItem } = require('./inventory-service');

function createValidationError(details) {
  const error = new Error('VALIDATION_FAILED');
  error.code = 'VALIDATION_FAILED';
  error.details = details;
  return error;
}

function calculateAttentionReasons(rows) {
  const normalizedNames = new Map();

  rows.forEach((row, index) => {
    if (hasValue(row.name)) {
      const key = String(row.name).trim().toLowerCase();
      const list = normalizedNames.get(key) || [];
      list.push(index);
      normalizedNames.set(key, list);
    }
  });

  return rows.map((row, index) => {
    const reasons = [];

    if (!hasValue(row.name)) {
      reasons.push('missing_name');
    }

    if (!hasValue(row.location)) {
      reasons.push('missing_location');
    }

    if (!hasValue(row.expirationDate)) {
      reasons.push('missing_expiration_date');
    }

    if (hasValue(row.name)) {
      const duplicates = normalizedNames.get(String(row.name).trim().toLowerCase()) || [];
      if (duplicates.length > 1) {
        reasons.push('possible_batch_duplicate');
      }
    }

    return reasons;
  });
}

function createFieldErrors(row) {
  const fieldErrors = {};

  if (row.quantity != null && row.quantity !== '' && (!Number.isFinite(Number(row.quantity)) || Number(row.quantity) <= 0)) {
    fieldErrors.quantity = 'Quantity must be a positive number when provided.';
  }

  if (hasValue(row.unit) && !hasValue(row.quantity)) {
    fieldErrors.unit = 'Unit requires quantity.';
  }

  if (hasValue(row.expirationDate)) {
    const validation = normalizeDraftRows([{ ...row }]);
    const dateError = validation.errors.find((error) => error.includes('.expirationDate '));
    if (dateError) {
      fieldErrors.expirationDate = 'Expiration date must be a valid ISO date.';
    }

    const dateTypeError = validation.errors.find((error) => error.includes('.dateType '));
    if (dateTypeError) {
      fieldErrors.dateType = 'Date type is invalid for the supplied expiration date.';
    }
  } else if (hasValue(row.dateType)) {
    fieldErrors.dateType = 'Date type requires an expiration date.';
  }

  return fieldErrors;
}

function buildReviewRows(rows) {
  const attentionReasons = calculateAttentionReasons(rows);

  return rows.map((row, index) => ({
    ...row,
    accepted: row.accepted !== false,
    attentionReasons: attentionReasons[index],
    fieldErrors: createFieldErrors(row),
    rowErrors: {
      missingName: row.accepted !== false && !hasValue(row.name),
      missingLocation: row.accepted !== false && !hasValue(row.location)
    }
  }));
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
    id: Number(batch.id),
    state: batch.state,
    sourceType: batch.source_type,
    rows: buildReviewRows(batch.rows.map((row) => ({
      id: Number(row.id),
      position: row.position,
      name: row.name ?? '',
      quantity: row.quantity ?? '',
      unit: row.unit ?? '',
      location: row.location ?? '',
      expirationDate: row.expiration_date ?? '',
      dateType: row.date_type ?? '',
      accepted: row.accepted !== false
    })))
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

async function markBatchPendingReview(batchId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await updateBatchState(batchId, 'pending_review', client);
    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function createInvalidStateError(message) {
  const error = new Error(message);
  error.code = 'INVALID_STATE_TRANSITION';
  return error;
}

async function confirmIntakeBatch(batchId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const batch = await getBatchForConfirmation(batchId, client);
    if (!batch) {
      const error = new Error('NOT_FOUND');
      error.code = 'NOT_FOUND';
      throw error;
    }

    if (batch.state !== 'pending_review') {
      throw createInvalidStateError('Batch is not ready for confirmation');
    }

    const hydratedBatch = {
      id: Number(batch.id),
      state: batch.state,
      sourceType: batch.source_type,
      rows: buildReviewRows(batch.rows.map((row) => ({
        id: Number(row.id),
        position: row.position,
        name: row.name ?? '',
        quantity: row.quantity ?? '',
        unit: row.unit ?? '',
        location: row.location ?? '',
        expirationDate: row.expiration_date ?? '',
        dateType: row.date_type ?? '',
        accepted: row.accepted !== false
      })))
    };

    const acceptedRows = hydratedBatch.rows.filter((row) => row.accepted !== false);
    const invalidAcceptedRows = acceptedRows.filter((row) => {
      const missingRequired = !hasValue(row.name) || !hasValue(row.location);
      const fieldErrors = createFieldErrors(row);
      return missingRequired || Object.keys(fieldErrors).length > 0;
    });

    if (invalidAcceptedRows.length > 0) {
      const error = new Error('VALIDATION_FAILED');
      error.code = 'VALIDATION_FAILED';
      error.details = invalidAcceptedRows.map((row) => `Accepted row ${row.position + 1} is invalid for confirmation`);
      throw error;
    }

    const createdItems = [];
    for (const row of acceptedRows) {
      const quantity = row.quantity === '' || row.quantity == null ? null : Number(row.quantity);
      const created = await createConfirmedInventoryItem({
        name: row.name,
        quantity,
        unit: row.unit === '' ? null : row.unit,
        location: row.location,
        expirationDate: row.expirationDate === '' ? null : row.expirationDate,
        dateType: row.dateType === '' ? null : row.dateType,
        sourceBatchId: hydratedBatch.id
      }, client);
      createdItems.push(created);
    }

    const confirmed = await setBatchConfirmed(hydratedBatch.id, client);
    if (!confirmed) {
      throw createInvalidStateError('Batch confirmation could not be applied');
    }

    await client.query('COMMIT');
    return {
      batchId: hydratedBatch.id,
      state: confirmed.state,
      createdItems
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  buildReviewRows,
  confirmIntakeBatch,
  ensureManualDraftBatch,
  getManualDraftBatch,
  saveManualDraftBatch,
  markBatchPendingReview
};