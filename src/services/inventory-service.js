const { createInventoryItem, getInventoryItemById, listActiveInventoryItems } = require('../db/inventory');
const { validateInventoryItem } = require('../validation/inventory');

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

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    location: item.location,
    quantity: item.quantity,
    unit: item.unit,
    expirationDate: formatCalendarDate(item.expiration_date),
    dateTypeLabel: item.expiration_date ? formatDateType(item.date_type) : null,
    isUndated: item.expiration_date == null
  }));
}

module.exports = {
  createConfirmedInventoryItem,
  getConfirmedInventoryItem,
  getActiveInventoryForDisplay
};