const { createInventoryItem, getInventoryItemById, updateInventoryItem, transitionInventoryLifecycle, listActiveInventoryItems } = require('../db/inventory');
const { validateInventoryItem } = require('../validation/inventory');
const { applyExpirationStatus, orderInventoryItemsForDisplay } = require('./expiration-status-service');
const { listInventoryItemNameLocations } = require('../db/inventory');
const { buildNameSuggestions } = require('./name-suggestion-service');
const { findDraftRowDuplicates, findRowDuplicateMatches } = require('./duplicate-detection-service');

async function createConfirmedInventoryItem(input, client) {
  const validation = validateInventoryItem(input);
  if (!validation.valid) {
    const error = new Error('VALIDATION_FAILED');
    error.code = 'VALIDATION_FAILED';
    error.details = validation.errors;
    throw error;
  }

  return createInventoryItem(
    {
      ...validation.value,
      sourceBatchId: input.sourceBatchId ?? null
    },
    client
  );
}

async function getConfirmedInventoryItem(id) {
  return getInventoryItemById(id);
}

function createNotFoundError() {
  const error = new Error('NOT_FOUND');
  error.code = 'NOT_FOUND';
  return error;
}

function createInvalidStateError(message) {
  const error = new Error(message);
  error.code = 'INVALID_STATE_TRANSITION';
  return error;
}

async function updateConfirmedInventoryItem(id, input) {
  const existing = await getInventoryItemById(id);
  if (!existing) {
    throw createNotFoundError();
  }

  if (existing.lifecycle_status !== 'active') {
    throw createInvalidStateError('Only active inventory items can be edited');
  }

  const validation = validateInventoryItem(input);
  if (!validation.valid) {
    const error = new Error('VALIDATION_FAILED');
    error.code = 'VALIDATION_FAILED';
    error.details = validation.errors;
    throw error;
  }

  return updateInventoryItem(id, validation.value);
}

async function markInventoryItemRemoved(id, lifecycleStatus) {
  const existing = await getInventoryItemById(id);
  if (!existing) {
    throw createNotFoundError();
  }

  if (existing.lifecycle_status !== 'active') {
    throw createInvalidStateError('Only active inventory items can be removed');
  }

  if (!['used_up', 'discarded'].includes(lifecycleStatus)) {
    throw createInvalidStateError('Unsupported lifecycle transition');
  }

  return transitionInventoryLifecycle(id, lifecycleStatus);
}

function formatDateType(dateType) {
  if (dateType === 'best_before') return 'Best before';
  if (dateType === 'use_by') return 'Use by';
  if (dateType === 'unspecified') return 'Date type not specified';
  return null;
}

function formatCalendarDate(dateValue) {
  if (!dateValue) {
    return null;
  }

  if (typeof dateValue === 'string') {
    return dateValue;
  }

  return String(dateValue);
}

async function getActiveInventoryForDisplay() {
  const items = await listActiveInventoryItems();

  const displayItems = items.map((item) => ({
    id: item.id,
    name: item.name,
    location: item.location,
    quantity: item.quantity,
    unit: item.unit,
    expirationDate: formatCalendarDate(item.expiration_date),
    dateTypeLabel: item.expiration_date ? formatDateType(item.date_type) : null,
    isUndated: item.expiration_date == null
  }));

  // Status is calculated per request, never persisted. Uses the centralized,
  // injectable application clock in config.expirationTimezone (Europe/Berlin),
  // then applies the expiration-prioritized display order (Ticket 3.2):
  // expired -> expiring_soon -> later, date ascending within each group, with
  // undated items kept visible at the end.
  return orderInventoryItemsForDisplay(applyExpirationStatus(displayItems));
}

// Ticket 3.3 — filter/search over ordered display items (AND-combined).
// Runs after expiration-status derivation because status is calculated per
// request and never persisted, so it cannot be part of the SQL WHERE clause.
// Route-level parsing guarantees shape; here every filter is optional and
// empty values simply do not constrain the result.
function filterInventoryItems(displayItems, filters = {}) {
  const { location = '', status = '', q = '' } = filters || {};
  const needle = String(q).trim().toLowerCase();

  if (!location && !status && !needle) {
    return displayItems.slice();
  }

  return displayItems.filter((item) => {
    if (location && item.location !== location) return false;
    if (status && item.expirationStatus !== status) return false;
    if (needle && !String(item.name || '').toLowerCase().includes(needle)) return false;
    return true;
  });
}

// Ticket 4.1 — read-only name suggestions from existing/prior entries.
// Aggregation and ranking live in the pure suggestion service; this wrapper
// only supplies the stored entry pairs and never performs any write.
async function getNameSuggestions(rawQuery) {
  const entries = await listInventoryItemNameLocations();
  return buildNameSuggestions(entries, rawQuery);
}

// Ticket 4.2 — advisory duplicate lookup against ACTIVE inventory. Both
// wrappers are purely read-side: they feed warnings on the manual batch
// editor and the /inventory/duplicate-check endpoint; nothing here writes,
// merges, or blocks. Failures of the underlying loader must be handled by
// callers (warnings degrade gracefully instead of breaking the editor).
async function getNameDuplicateWarnings(rawQuery) {
  const items = await getActiveInventoryForDisplay();
  return findRowDuplicateMatches(String(rawQuery ?? ''), items);
}

async function getDraftRowDuplicateWarnings(draftRows) {
  const items = await getActiveInventoryForDisplay();
  return findDraftRowDuplicates(Array.isArray(draftRows) ? draftRows : [], items);
}

module.exports = {
  createConfirmedInventoryItem,
  getConfirmedInventoryItem,
  updateConfirmedInventoryItem,
  markInventoryItemRemoved,
  getActiveInventoryForDisplay,
  filterInventoryItems,
  getNameSuggestions,
  getNameDuplicateWarnings,
  getDraftRowDuplicateWarnings
};