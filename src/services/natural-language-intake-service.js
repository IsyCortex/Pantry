// Ticket 2.2 orchestration: acquire text -> analyze through the configured,
// contract-wrapped provider -> persist as an editable review batch carrying
// the original text and provider-neutral metadata. Never writes inventory;
// confirmation stays inside the shared review workflow (ADR-0002).

const pool = require('../db/pool');
const config = require('../config');
const {
  createNaturalLanguageIntakeBatch,
  replaceDraftBatchItems,
  updateBatchState
} = require('../db/intake-batches');
const { createAnalyzerProvider } = require('../analyzers/provider');
const { MAX_RAW_TEXT_LENGTH } = require('../validation/analyzer-contract');

// Canonical failure categories (Ticket 2.3): user-facing errors carry one of
// these codes; raw provider errors never cross the service boundary.
const ANALYSIS_ERROR_CODES = {
  INVALID_RESPONSE: 'AI_INVALID_RESPONSE',
  ANALYSIS_FAILED: 'AI_ANALYSIS_FAILED',
  NO_ITEMS_FOUND: 'NO_ITEMS_FOUND'
};

function createAnalysisInputError(message) {
  const error = new Error(message);
  error.code = 'ANALYSIS_INPUT_REQUIRED';
  return error;
}

function createInputTooLongError() {
  const error = new Error(
    `Your description is too long to analyze (maximum ${MAX_RAW_TEXT_LENGTH} characters). Shorten it and try again.`
  );
  error.code = 'ANALYSIS_INPUT_TOO_LONG';
  return error;
}

function createAnalysisFailedError() {
  const error = new Error(
    'The analysis failed. Your description was preserved, so you can retry or continue manually.'
  );
  error.code = ANALYSIS_ERROR_CODES.ANALYSIS_FAILED;
  return error;
}

function createInvalidResponseError() {
  const error = new Error(
    'The analysis returned an unusable response. Your description was preserved, so you can retry or continue manually.'
  );
  error.code = ANALYSIS_ERROR_CODES.INVALID_RESPONSE;
  return error;
}

function createNoItemsFoundError() {
  const error = new Error('No grocery items were recognized in your description.');
  error.code = ANALYSIS_ERROR_CODES.NO_ITEMS_FOUND;
  return error;
}

// Maps a thrown provider/resolution failure to its safe category without
// leaking provider details: unparseable responses (SyntaxError) and output
// rejected by the shared contract validator are invalid responses; transport,
// execution, resolution, and timeout failures are analysis failures.
function classifyAnalysisFailure(error) {
  if (error instanceof SyntaxError) {
    return ANALYSIS_ERROR_CODES.INVALID_RESPONSE;
  }
  if (
    typeof error.message === 'string' &&
    error.message.startsWith('ANALYZER_INVALID_OUTPUT')
  ) {
    return ANALYSIS_ERROR_CODES.INVALID_RESPONSE;
  }
  return ANALYSIS_ERROR_CODES.ANALYSIS_FAILED;
}

// Enforces the contract's wall-clock budget per analysis call. Overruns reject
// and are classified as ordinary analysis failures by the caller's catch.
function withAnalysisTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('ANALYSIS_TIMED_OUT')), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// The application owns analyzer context (docs/input-pipeline.md): providers
// never infer date, timezone, or locale themselves.
//
// The timezone comes from configuration (ANALYZER_TIMEZONE, default UTC) and
// the reference date is derived as the calendar date *inside that timezone*,
// so the two can never disagree around local midnight — a naive UTC date
// slice would report the previous day there.
function calendarDateInZone(date, timezone) {
  // en-CA formats as YYYY-MM-DD, matching the contract's ISO date requirement.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function buildAnalyzerInput(rawText, now = new Date()) {
  const timezone = config.analyzerTimezone;

  return {
    rawText,
    referenceDate: calendarDateInZone(now, timezone),
    timezone,
    locale: 'en-US'
  };
}

function normalizeProposalItem(item, position) {
  // The draft-items table stores absent values as SQL NULL (numeric/date
  // columns reject ''), so empty proposal fields are normalized to null here.
  const orNull = (value) => (value == null || value === '' ? null : value);

  return {
    position,
    name: typeof item.name === 'string' ? item.name : '',
    quantity: item.quantity == null ? null : item.quantity,
    unit: orNull(item.unit),
    location: orNull(item.location),
    expirationDate: orNull(item.expirationDate),
    dateType: orNull(item.dateType),
    accepted: true
  };
}

async function analyzeAndCreateReviewBatch({ rawText }, options = {}) {
  const trimmedText = typeof rawText === 'string' ? rawText.trim() : '';
  if (!trimmedText) {
    throw createAnalysisInputError('Enter a grocery description to analyze.');
  }
  // Contract input limit, enforced before any provider work so oversized
  // submissions never reach the analyzer (Ticket 2.3 size limits).
  if (trimmedText.length > MAX_RAW_TEXT_LENGTH) {
    throw createInputTooLongError();
  }

  // Provider resolution sits inside the same safe boundary as analysis: a
  // misconfigured or unavailable provider must degrade to the recoverable
  // analysis-failed state instead of surfacing as an unhandled 500. Tests can
  // inject a ready provider or force a specific resolution kind explicitly.
  let provider;
  let proposal;
  try {
    provider =
      options.analyzerProvider ||
      createAnalyzerProvider({ kind: options.analyzerProviderKind || config.analyzerProvider });
    proposal = await withAnalysisTimeout(
      provider.analyze(buildAnalyzerInput(trimmedText)),
      options.analysisTimeoutMs != null ? options.analysisTimeoutMs : config.analyzerTimeoutMs
    );
  } catch (error) {
    if (classifyAnalysisFailure(error) === ANALYSIS_ERROR_CODES.INVALID_RESPONSE) {
      throw createInvalidResponseError();
    }
    throw createAnalysisFailedError();
  }

  const items = Array.isArray(proposal && proposal.items) ? proposal.items : [];
  if (items.length === 0) {
    throw createNoItemsFoundError();
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const batch = await createNaturalLanguageIntakeBatch(
      {
        originalText: trimmedText,
        processorId: provider.name,
        processorVersion: provider.version != null ? String(provider.version) : null
      },
      client
    );
    const batchId = Number(batch.id);
    await replaceDraftBatchItems(batchId, items.map(normalizeProposalItem), client);
    await updateBatchState(batchId, 'pending_review', client);
    await client.query('COMMIT');
    return { batchId, sourceType: 'natural_language', itemCount: items.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  ANALYSIS_ERROR_CODES,
  analyzeAndCreateReviewBatch,
  buildAnalyzerInput,
  calendarDateInZone
};