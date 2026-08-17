const { createInventoryItem, getInventoryItemById } = require('../db/inventory');
const { validateInventoryItem } = require('../validation/inventory');

async function createConfirmedInventoryItem(input) {
  const validation = validateInventoryItem(input);
  if (!validation.valid) {
    const error = new Error('VALIDATION_FAILED');
    error.code = 'VALIDATION_FAILED';
    error.details = validation.errors;
    throw error;
  }

  return createInventoryItem(validation.value);
}

async function getConfirmedInventoryItem(id) {
  return getInventoryItemById(id);
}

module.exports = {
  createConfirmedInventoryItem,
  getConfirmedInventoryItem
};