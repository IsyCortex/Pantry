// Ticket 2.2 orchestration: acquire text -> analyze through the configured,
// contract-wrapped provider -> persist as an editable review batch carrying
// the original text and provider-neutral metadata. Never writes inventory;
// confirmation stays inside the shared review workflow (ADR-0002).

const pool = require('../db/pool');
const {
  createNaturalLanguageIntakeBatch,
  replaceDraftBatchItems,
  updateBatchState
} = require('../db/intake-batches');
const { resolveAnalyzerProvider } = require('../analyzers/provider');

function createAnalysisInputError(message) {
  const error = new Error(message);
  error.code = 'ANALYSIS_INPUT_REQUIRED';
  return error;
}

function createAnalysisFailedError() {
  const error = new Error(
    'The analysis failed. Your description was preserved, so you can retry or continue manually.'
  );
  error.code = 'ANALYSIS_FAILED';
  return error;
}

function createNoItemsFoundError() {
  const error = new Error('No grocery items were recognized in your description.');
  error.code = 'NO_ITEMS_FOUND';
  return error;
}

// The application owns analyzer context (docs/input-pipeline.md): providers
// never infer date, timezone, or locale themselves.
function buildAnalyzerInput(rawText, now = new Date()) {
  let timezone = 'UTC';
  try {
    timezone = new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (error) {
    timezone = 'UTC';
  }

  return {
    rawText,
    referenceDate: now.toISOString().slice(0, 10),
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

  const provider = options.analyzerProvider || resolveAnalyzerProvider();

  // The provider factory wraps every provider with the shared contract
  // validator (Ticket 2.1), so a resolved proposal here is structurally valid.
  let proposal;
  try {
    proposal = await provider.analyze(buildAnalyzerInput(trimmedText));
  } catch (error) {
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

module.exports = { analyzeAndCreateReviewBatch };