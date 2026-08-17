const express = require('express');
const {
  ensureManualDraftBatch,
  saveManualDraftBatch
} = require('../services/intake-batch-service');
const { VALID_LOCATIONS, VALID_UNITS, VALID_DATE_TYPES } = require('../validation/intake-batch');

function createEmptyRow(location = '') {
  return {
    name: '',
    quantity: '',
    unit: '',
    location,
    expirationDate: '',
    dateType: '',
    accepted: true
  };
}

function getActionIndex(body) {
  const raw = body.actionRowIndex;
  if (Array.isArray(raw)) {
    const last = raw[raw.length - 1];
    return Number(last || 0);
  }

  return Number(raw || 0);
}

function parseRows(body) {
  const rows = [];
  const source = body.rows || [];
  for (const row of source) {
    rows.push({
      name: row.name,
      quantity: row.quantity,
      unit: row.unit,
      location: row.location,
      expirationDate: row.expirationDate,
      dateType: row.dateType,
      accepted: row.accepted !== 'false'
    });
  }
  return rows;
}

function createIntakeBatchRouter() {
  const router = express.Router();

  router.get('/batches/manual', async (_req, res, next) => {
    try {
      const batch = await ensureManualDraftBatch();
      const rows = batch.rows.length > 0 ? batch.rows : [createEmptyRow()];
      res.render('manual-batch', {
        title: 'Manual intake batch',
        batchId: batch.id,
        rows,
        defaultLocation: '',
        errors: [],
        locations: Array.from(VALID_LOCATIONS),
        units: Array.from(VALID_UNITS),
        dateTypes: Array.from(VALID_DATE_TYPES)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/batches/manual', async (req, res, next) => {
    const action = req.body.action || 'save';
    const defaultLocation = req.body.defaultLocation || '';
    let rows = parseRows(req.body);

    if (action === 'add-row') {
      rows.push(createEmptyRow(defaultLocation));
      return res.status(200).render('manual-batch', {
        title: 'Manual intake batch',
        batchId: req.body.batchId || '',
        rows,
        defaultLocation,
        errors: [],
        locations: Array.from(VALID_LOCATIONS),
        units: Array.from(VALID_UNITS),
        dateTypes: Array.from(VALID_DATE_TYPES)
      });
    }

    if (action === 'duplicate-row') {
      const index = getActionIndex(req.body);
      const source = rows[index] || createEmptyRow(defaultLocation);
      rows.splice(index + 1, 0, { ...source });
      return res.status(200).render('manual-batch', {
        title: 'Manual intake batch',
        batchId: req.body.batchId || '',
        rows,
        defaultLocation,
        errors: [],
        locations: Array.from(VALID_LOCATIONS),
        units: Array.from(VALID_UNITS),
        dateTypes: Array.from(VALID_DATE_TYPES)
      });
    }

    if (action === 'remove-row') {
      const index = getActionIndex(req.body);
      rows.splice(index, 1);
      if (rows.length === 0) {
        rows.push(createEmptyRow(defaultLocation));
      }
      return res.status(200).render('manual-batch', {
        title: 'Manual intake batch',
        batchId: req.body.batchId || '',
        rows,
        defaultLocation,
        errors: [],
        locations: Array.from(VALID_LOCATIONS),
        units: Array.from(VALID_UNITS),
        dateTypes: Array.from(VALID_DATE_TYPES)
      });
    }

    if (action === 'move-up' || action === 'move-down') {
      const index = getActionIndex(req.body);
      const targetIndex = action === 'move-up' ? index - 1 : index + 1;
      if (targetIndex >= 0 && targetIndex < rows.length) {
        const [row] = rows.splice(index, 1);
        rows.splice(targetIndex, 0, row);
      }
      return res.status(200).render('manual-batch', {
        title: 'Manual intake batch',
        batchId: req.body.batchId || '',
        rows,
        defaultLocation,
        errors: [],
        locations: Array.from(VALID_LOCATIONS),
        units: Array.from(VALID_UNITS),
        dateTypes: Array.from(VALID_DATE_TYPES)
      });
    }

    try {
      const batch = await saveManualDraftBatch({
        batchId: req.body.batchId ? Number(req.body.batchId) : null,
        rows
      });

      res.status(200).render('manual-batch', {
        title: 'Manual intake batch',
        batchId: batch.id,
        rows: batch.rows.length > 0 ? batch.rows : [createEmptyRow(defaultLocation)],
        defaultLocation,
        errors: [],
        locations: Array.from(VALID_LOCATIONS),
        units: Array.from(VALID_UNITS),
        dateTypes: Array.from(VALID_DATE_TYPES)
      });
    } catch (error) {
      if (error.code === 'VALIDATION_FAILED') {
        res.status(400).render('manual-batch', {
          title: 'Manual intake batch',
          batchId: req.body.batchId || '',
          rows: rows.length > 0 ? rows : [createEmptyRow(defaultLocation)],
          defaultLocation,
          errors: error.details,
          locations: Array.from(VALID_LOCATIONS),
          units: Array.from(VALID_UNITS),
          dateTypes: Array.from(VALID_DATE_TYPES)
        });
        return;
      }

      next(error);
    }
  });

  return router;
}

module.exports = { createIntakeBatchRouter };