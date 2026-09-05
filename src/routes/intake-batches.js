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
const { getActiveInventoryForDisplay } = require('../services/inventory-service');
const { findDraftRowDuplicates } = require('../services/duplicate-detection-service');
const { VALID_LOCATIONS, VALID_UNITS, VALID_DATE_TYPES } = require('../validation/intake-batch');
const { toUserValidationMessages } = require('../validation/user-messages');

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

function getActionIndex(body, query) {
  // Ticket 4.3 — row-action buttons target their own row via a formaction
  // query parameter (works without JavaScript); the sr-only keyboard helper
  // button supplies actionRowIndex as a form field.
  const raw = (body && body.actionRowIndex) || (query && query.row);
  return Number(raw || 0);
}

// Ticket 4.3 — derive the row that should receive focus after a validation
// failure. Details arrive either as human-readable strings ("Row 2: ...") or
// as per-row field-error objects (review corrections). Falls back to the
// first row whenever errors exist but carry no row information, and to -1
// (no focus) when there are no details at all.
function firstErrorRowIndex(details) {
  if (!Array.isArray(details) || details.length === 0) {
    return -1;
  }
  for (let index = 0; index < details.length; index += 1) {
    const detail = details[index];
    if (detail && typeof detail === 'object') {
      const objectIndex = Number(detail.index);
      const objectPosition = Number(detail.position);
      if (Number.isFinite(objectIndex)) {
        return objectIndex;
      }
      if (Number.isFinite(objectPosition)) {
        return objectPosition;
      }
      const hasAnyError = Object.keys(detail).some((key) => detail[key]);
      if (hasAnyError) {
        return index;
      }
      continue;
    }
    const match = String(detail).match(/row\D*(\d+)/i);
    if (match) {
      return Number(match[1]) - 1;
    }
  }
  return 0;
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

function createReviewLocals({ batchId, rows, defaultLocation, errors = [], notice = null, focusRow = -1 }) {
  return {
    title: 'Review intake batch',
    batchId,
    rows: buildReviewRows(rows),
    defaultLocation,
    errors,
    notice,
    focusRow,
    locations: Array.from(VALID_LOCATIONS),
    units: Array.from(VALID_UNITS),
    dateTypes: Array.from(VALID_DATE_TYPES)
  };
}

function buildReviewErrorDetails(rows) {
  return buildReviewRows(rows).map((row) => row.fieldErrors);
}

function createIntakeBatchRouter(options = {}) {
  // Ticket 4.2 — injectable so route tests can exercise the manual editor
  // against a stubbed active-inventory source instead of the database.
  const activeInventoryLoader = options.activeInventoryLoader || getActiveInventoryForDisplay;

  // Ticket 4.2 — single render path for the manual batch editor. Before every
  // render it compares each draft row with the ACTIVE inventory and attaches
  // advisory duplicate warnings. Warnings never influence validation or
  // confirmation semantics, and even a failing loader degrades gracefully to
  // "no warnings" instead of interrupting entry work.
  async function renderManualBatch(res, { batchId, rows, defaultLocation, errors = [], notice = null, focusRow = -1 }, status = 200) {
    let warnings;
    try {
      const activeItems = await activeInventoryLoader();
      warnings = findDraftRowDuplicates(rows, activeItems);
    } catch (error) {
      console.error(error.stack || error);
      warnings = rows.map(() => []);
    }
    // Ticket 5.1 — validation details are technical tokens ("rows[0]...");
    // translate them into user-facing messages so the editor never shows
    // internal field names or developer jargon.
    const userErrors = toUserValidationMessages(errors);
    res.status(status).render('manual-batch', {
      title: 'Manual intake batch',
      batchId,
      rows: rows.map((row, index) => ({ ...row, duplicateWarnings: warnings[index] || [] })),
      defaultLocation,
      errors: userErrors,
      notice,
      focusRow,
      locations: Array.from(VALID_LOCATIONS),
      units: Array.from(VALID_UNITS),
      dateTypes: Array.from(VALID_DATE_TYPES)
    });
  }

  // Ticket 4.2 — single render path for the AI draft-review page, mirroring
  // renderManualBatch: before EVERY render (normal GET, saved-corrections
  // target, validation-error, confirmation-error) each review row is compared
  // with the ACTIVE inventory and gets advisory duplicate warnings attached.
  // Warnings never influence validation or confirmation semantics: rows stay
  // includable/excludable via their own control, confirmation stays
  // available, and confirming continues to create separate inventory entries
  // without combining quantities or dates.
  async function sendBatchReview(res, locals, status = 200) {
    const rows = Array.isArray(locals.rows) ? locals.rows : [];
    // Ticket 5.1 — translate technical validation tokens into user-facing
    // messages on every review re-render (GET, saved-corrections,
    // validation-error, confirmation-error paths all flow through here).
    const userErrors = toUserValidationMessages(locals.errors || []);
    let warnings;
    try {
      const activeItems = await activeInventoryLoader();
      warnings = findDraftRowDuplicates(rows.map((row) => ({ name: row.name })), activeItems);
    } catch (error) {
      console.error(error.stack || error);
      warnings = rows.map(() => []);
    }
    res.status(status).render('batch-review', {
      ...locals,
      errors: userErrors,
      rows: rows.map((row, index) => ({ ...row, duplicateWarnings: warnings[index] || [] }))
    });
  }

  const router = express.Router();

  router.get('/batches/manual', async (req, res, next) => {
    try {
      const batch = await ensureManualDraftBatch();
      const rows = batch.rows.length > 0 ? batch.rows : [createEmptyRow()];
      await renderManualBatch(res, {
        batchId: batch.id,
        rows,
        defaultLocation: '',
        errors: [],
        notice: req.query.notice === 'saved' ? 'Draft batch saved.' : null
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
      return renderManualBatch(res, {
        batchId: req.body.batchId || '',
        rows,
        defaultLocation,
        errors: [],
        notice: 'Row added.',
        focusRow: rows.length - 1
      });
    }

    if (action === 'duplicate-row') {
      const index = getActionIndex(req.body, req.query);
      const source = rows[index] || createEmptyRow(defaultLocation);
      rows.splice(index + 1, 0, { ...source });
      return renderManualBatch(res, {
        batchId: req.body.batchId || '',
        rows,
        defaultLocation,
        errors: [],
        notice: 'Row duplicated.',
        focusRow: index + 1
      });
    }

    if (action === 'remove-row') {
      const index = getActionIndex(req.body, req.query);
      rows.splice(index, 1);
      if (rows.length === 0) {
        rows.push(createEmptyRow(defaultLocation));
      }
      return renderManualBatch(res, {
        batchId: req.body.batchId || '',
        rows,
        defaultLocation,
        errors: [],
        notice: 'Row removed.',
        focusRow: Math.min(index, rows.length - 1)
      });
    }

    if (action === 'move-up' || action === 'move-down') {
      const index = getActionIndex(req.body, req.query);
      const targetIndex = action === 'move-up' ? index - 1 : index + 1;
      let focusRow = index;
      if (targetIndex >= 0 && targetIndex < rows.length) {
        const [row] = rows.splice(index, 1);
        rows.splice(targetIndex, 0, row);
        focusRow = targetIndex;
      }
      return renderManualBatch(res, {
        batchId: req.body.batchId || '',
        rows,
        defaultLocation,
        errors: [],
        notice: action === 'move-up' ? 'Row moved up.' : 'Row moved down.',
        focusRow
      });
    }

        if (action === 'enter-row') {
      // Ticket 4.3 — no-JS keyboard fallback for "advance to next row": move
      // focus to the following row's Name field (or the last row if this is
      // already last), without saving. With JavaScript present the 4.1 handler
      // advances focus client-side instead; this branch makes the editor fully
      // functional without JavaScript.
      const index = getActionIndex(req.body, req.query);
      const safeIndex = Number.isFinite(index) && index >= 0 && index < rows.length ? index : 0;
      const nextIndex = safeIndex < rows.length - 1 ? safeIndex + 1 : rows.length - 1;
      return renderManualBatch(res, {
        batchId: req.body.batchId || '',
        rows,
        defaultLocation,
        errors: [],
        notice: 'Moved to row ' + (nextIndex + 1) + '.',
        focusRow: nextIndex
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
          return renderManualBatch(res, {
            batchId: req.body.batchId || '',
            rows: rows.length > 0 ? rows : [createEmptyRow(defaultLocation)],
            defaultLocation,
            errors: error.details,
            notice: null,
            focusRow: firstErrorRowIndex(error.details)
          }, 400);
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
        await renderManualBatch(res, {
          batchId: req.body.batchId || '',
          rows: rows.length > 0 ? rows : [createEmptyRow(defaultLocation)],
          defaultLocation,
          errors: error.details,
          notice: null,
          focusRow: firstErrorRowIndex(error.details)
        }, 400);
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
        {
          analyzerProvider: options.analyzerProvider,
          analyzerProviderKind: options.analyzerProviderKind,
          analysisTimeoutMs: options.analysisTimeoutMs
        }
      );
      res.redirect(`/batches/${result.batchId}/review`);
    } catch (error) {
      const recoverableCodes = [
        'ANALYSIS_INPUT_REQUIRED',
        'ANALYSIS_INPUT_TOO_LONG',
        'AI_INVALID_RESPONSE',
        'NO_ITEMS_FOUND',
        'AI_ANALYSIS_FAILED'
      ];
      if (recoverableCodes.includes(error.code)) {
        const isClientInput = error.code === 'ANALYSIS_INPUT_REQUIRED' || error.code === 'ANALYSIS_INPUT_TOO_LONG';
        renderNaturalLanguageForm(req, res, { status: isClientInput ? 400 : 422, errors: [error.message] });
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

      await sendBatchReview(res, {
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
        await sendBatchReview(res, {
          ...createReviewLocals({
            batchId: req.params.batchId,
            rows,
            defaultLocation,
                        errors: error.details,
            focusRow: firstErrorRowIndex(error.details)
          }),
          structuredFieldErrors: buildReviewErrorDetails(rows)
        }, 400);
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
        await sendBatchReview(res, {
          ...createReviewLocals({
            batchId: req.params.batchId,
            rows: batch ? batch.rows : [],
            defaultLocation: '',
                        errors: error.details,
            focusRow: firstErrorRowIndex(error.details)
          }),
          structuredFieldErrors: buildReviewErrorDetails(batch ? batch.rows : [])
        }, 400);
        return;
      }

      if (error.code === 'INVALID_STATE_TRANSITION') {
        const batch = await getManualDraftBatch(Number(req.params.batchId));
        await sendBatchReview(res, {
          ...createReviewLocals({
            batchId: req.params.batchId,
            rows: batch ? batch.rows : [],
            defaultLocation: '',
                        errors: [error.message],
            focusRow: firstErrorRowIndex([error.message])
          }),
          structuredFieldErrors: buildReviewErrorDetails(batch ? batch.rows : [])
        }, 409);
        return;
      }

      next(error);
    }
  });

  return router;
}

module.exports = { createIntakeBatchRouter };