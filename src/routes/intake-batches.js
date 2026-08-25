const express = require('express');
const {
  ensureManualDraftBatch,
  saveManualDraftBatch,
  getManualDraftBatch,
  buildReviewRows,
  confirmIntakeBatch,
  confirmManualBatchFromInput
} = require('../services/intake-batch-service');
const { analyzeAndCreateReviewBatch } = require('../services/natural-language-intake-service');
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

function createReviewLocals({ batchId, rows, defaultLocation, errors = [], notice = null }) {
  return {
    title: 'Review intake batch',
    batchId,
    rows: buildReviewRows(rows),
    defaultLocation,
    errors,
    notice,
    locations: Array.from(VALID_LOCATIONS),
    units: Array.from(VALID_UNITS),
    dateTypes: Array.from(VALID_DATE_TYPES)
  };
}

function buildReviewErrorDetails(rows) {
  return buildReviewRows(rows).map((row) => row.fieldErrors);
}

function createIntakeBatchRouter(options = {}) {
  const router = express.Router();

  router.get('/batches/manual', async (req, res, next) => {
    try {
      const batch = await ensureManualDraftBatch();
      const rows = batch.rows.length > 0 ? batch.rows : [createEmptyRow()];
      res.render('manual-batch', {
        title: 'Manual intake batch',
        batchId: batch.id,
        rows,
        defaultLocation: '',
        errors: [],
        notice: req.query.notice === 'saved' ? 'Draft batch saved.' : null,
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
        notice: 'Row added.',
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
        notice: 'Row duplicated.',
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
        notice: 'Row removed.',
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
        notice: action === 'move-up' ? 'Row moved up.' : 'Row moved down.',
        locations: Array.from(VALID_LOCATIONS),
        units: Array.from(VALID_UNITS),
        dateTypes: Array.from(VALID_DATE_TYPES)
      });
    }

    // Manual input goes straight to the inventory; the review workflow is
    // reserved for AI-proposed input that needs human review (ADR-0002).
    if (action === 'save-to-inventory') {
      try {
        const confirmation = await confirmManualBatchFromInput({
          batchId: req.body.batchId ? Number(req.body.batchId) : null,
          rows
        });

        res.redirect(`/inventory?notice=confirmed&created=${confirmation.createdItems.length}`);
        return;
      } catch (error) {
        if (error.code === 'VALIDATION_FAILED') {
          res.status(400).render('manual-batch', {
            title: 'Manual intake batch',
            batchId: req.body.batchId || '',
            rows: rows.length > 0 ? rows : [createEmptyRow(defaultLocation)],
            defaultLocation,
            errors: error.details,
            notice: null,
            locations: Array.from(VALID_LOCATIONS),
            units: Array.from(VALID_UNITS),
            dateTypes: Array.from(VALID_DATE_TYPES)
          });
          return;
        }

        next(error);
        return;
      }
    }

    try {
      const batch = await saveManualDraftBatch({
        batchId: req.body.batchId ? Number(req.body.batchId) : null,
        rows
      });

      // Ground rule 3: after saving a batch, forward to the page/report that
      // shows the batch (the manual batch page), with a confirmation.
      res.redirect('/batches/manual?notice=saved');
    } catch (error) {
      if (error.code === 'VALIDATION_FAILED') {
        res.status(400).render('manual-batch', {
          title: 'Manual intake batch',
          batchId: req.body.batchId || '',
          rows: rows.length > 0 ? rows : [createEmptyRow(defaultLocation)],
          defaultLocation,
          errors: error.details,
          notice: null,
          locations: Array.from(VALID_LOCATIONS),
          units: Array.from(VALID_UNITS),
          dateTypes: Array.from(VALID_DATE_TYPES)
        });
        return;
      }

      next(error);
    }
  });

  // Natural-language intake (Ticket 2.2): the submitted description is always
  // preserved on failure so the user can retry or fall back to the manual
  // batch editor without retyping anything.
  const renderNaturalLanguageForm = (req, res, { status = 200, errors = [] } = {}) => {
    res.status(status).render('natural-language-batch', {
      title: 'Natural-language intake',
      rawText: req.body && typeof req.body.rawText === 'string' ? req.body.rawText : '',
      errors,
      notice: null
    });
  };

  router.get('/batches/natural-language', (req, res) => {
    renderNaturalLanguageForm(req, res);
  });

  router.post('/batches/natural-language', async (req, res, next) => {
    try {
      const result = await analyzeAndCreateReviewBatch(
        { rawText: req.body.rawText },
        { analyzerProvider: options.analyzerProvider }
      );
      res.redirect(`/batches/${result.batchId}/review`);
    } catch (error) {
      if (
        error.code === 'ANALYSIS_INPUT_REQUIRED' ||
        error.code === 'NO_ITEMS_FOUND' ||
        error.code === 'ANALYSIS_FAILED'
      ) {
        renderNaturalLanguageForm(req, res, { status: error.code === 'ANALYSIS_INPUT_REQUIRED' ? 400 : 422, errors: [error.message] });
        return;
      }

      next(error);
    }
  });

  router.get('/batches/:batchId/review', async (req, res, next) => {
    try {
      const batch = await getManualDraftBatch(Number(req.params.batchId));
      if (!batch) {
        res.status(404).send('Batch not found');
        return;
      }

      res.status(200).render('batch-review', {
        ...createReviewLocals({
          batchId: batch.id,
          rows: batch.rows,
          defaultLocation: '',
          notice: req.query.notice === 'corrections_saved' ? 'Review corrections saved.' : null
        }),
        originalText: batch.originalText || ''
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/batches/:batchId/review', async (req, res, next) => {
    const rows = parseRows(req.body);
    const defaultLocation = req.body.defaultLocation || '';

    try {
      const saved = await saveManualDraftBatch({
        batchId: Number(req.params.batchId),
        rows
      });

      // Ground rule 3: after saving review corrections, forward to the batch
      // report (the review page) with a confirmation.
      res.redirect(`/batches/${saved.id}/review?notice=corrections_saved`);
    } catch (error) {
      if (error.code === 'VALIDATION_FAILED') {
        res.status(400).render('batch-review', {
          ...createReviewLocals({
          batchId: req.params.batchId,
          rows,
          defaultLocation,
          errors: error.details
          }),
          structuredFieldErrors: buildReviewErrorDetails(rows)
        });
        return;
      }

      next(error);
    }
  });

  router.post('/batches/:batchId/confirm', async (req, res, next) => {
    try {
      const confirmation = await confirmIntakeBatch(Number(req.params.batchId));
      res.redirect(`/inventory?notice=confirmed&created=${confirmation.createdItems.length}`);
    } catch (error) {
      if (error.code === 'VALIDATION_FAILED') {
        const batch = await getManualDraftBatch(Number(req.params.batchId));
        res.status(400).render('batch-review', {
          ...createReviewLocals({
            batchId: req.params.batchId,
            rows: batch ? batch.rows : [],
            defaultLocation: '',
            errors: error.details
          }),
          structuredFieldErrors: buildReviewErrorDetails(batch ? batch.rows : [])
        });
        return;
      }

      if (error.code === 'INVALID_STATE_TRANSITION') {
        const batch = await getManualDraftBatch(Number(req.params.batchId));
        res.status(409).render('batch-review', {
          ...createReviewLocals({
            batchId: req.params.batchId,
            rows: batch ? batch.rows : [],
            defaultLocation: '',
            errors: [error.message]
          }),
          structuredFieldErrors: buildReviewErrorDetails(batch ? batch.rows : [])
        });
        return;
      }

      next(error);
    }
  });

  return router;
}

module.exports = { createIntakeBatchRouter };