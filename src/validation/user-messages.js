'use strict';

// Ticket 5.1 (Issue #24) — user-facing conversion for validation failures.
//
// Internal validation messages use technical field tokens such as
// "rows[2].quantity must be a positive number when provided". This module
// translates those tokens into specific, understandable messages shown next
// to the form. Messages already written for users pass through unchanged, so
// the mapper is safe to apply to every validation detail list regardless of
// its origin (manual save, review save, confirmation, inventory edit).

const ROW_TOKEN = /^rows\[(\d+)\]\.(\w+)(?:\s+(.*))?$/;

const FIELD_MESSAGES = {
  name: (row) => `Row ${row}: Name must be 1 to 120 characters.`,
  location: (row) => `Row ${row}: Location must be one of: pantry, fridge, freezer.`,
  quantity: (row) => `Row ${row}: Quantity must be a number greater than 0.`,
  unit: (row) => `Row ${row}: Choose a quantity when a unit is set.`,
  unitInvalid: (row) => `Row ${row}: Unit must be one of: g, kg, ml, l, piece, package.`,
  expirationDate: (row) => `Row ${row}: Expiration date must be a valid calendar date.`,
  dateTypeRequiresDate: (row) => `Row ${row}: A date type can only be set together with an expiration date.`,
  dateTypeInvalid: (row) => `Row ${row}: Date type must be one of: best before, use by, unspecified.`
};

const UNIT_REQUIRES_QUANTITY = /requires quantity|requiresQuantity/i;
const DATE_TYPE_REQUIRES_DATE = /must be null|requires an expiration date/i;

// Field-scoped messages produced by src/validation/inventory.js (inventory
// create/edit). They carry no row prefix but still use developer wording.
const FIELD_MESSAGE_PATTERNS = [
  { re: /^name is required$/, message: () => 'Name is required.' },
  { re: /^name must be 1 to 120 trimmed characters$/, message: () => 'Name must be 1 to 120 characters.' },
  { re: /^location is invalid$/, message: () => 'Location must be one of: pantry, fridge, freezer.' },
  { re: /^quantity must be a positive number when provided$/, message: () => 'Quantity must be a number greater than 0.' },
  { re: /^unit requires quantity$/, message: () => 'Choose a quantity when a unit is set.' },
  { re: /^unit is invalid$/, message: () => 'Unit must be one of: g, kg, ml, l, piece, package.' },
  { re: /^expirationDate must be a valid ISO date when provided$/, message: () => 'Expiration date must be a valid calendar date.' },
  { re: /^dateType must be null when expirationDate is missing$/, message: () => 'A date type can only be set together with an expiration date.' },
  { re: /^dateType is invalid$/, message: () => 'Date type must be one of: best before, use by, unspecified.' }
];

function describeRowToken(text) {
  const match = ROW_TOKEN.exec(text);
  if (!match) {
    return null;
  }

  const row = Number(match[1]) + 1;
  const field = match[2];
  const rest = match[3] || '';

  if (field === 'name') return FIELD_MESSAGES.name(row);
  if (field === 'location') return FIELD_MESSAGES.location(row);
  if (field === 'quantity') return FIELD_MESSAGES.quantity(row);
  if (field === 'unit') {
    return UNIT_REQUIRES_QUANTITY.test(rest)
      ? FIELD_MESSAGES.unit(row)
      : FIELD_MESSAGES.unitInvalid(row);
  }
  if (field === 'expirationDate') return FIELD_MESSAGES.expirationDate(row);
  if (field === 'dateType') {
    return DATE_TYPE_REQUIRES_DATE.test(rest)
      ? FIELD_MESSAGES.dateTypeRequiresDate(row)
      : FIELD_MESSAGES.dateTypeInvalid(row);
  }

  return null;
}

function describeFieldMessage(text) {
  for (const { re, message } of FIELD_MESSAGE_PATTERNS) {
    if (re.test(text)) {
      return message();
    }
  }
  return null;
}

function userMessageForDetail(detail) {
  if (detail && typeof detail === 'object') {
    // Field-error object ({ quantity: '...' }): pick the first non-empty
    // message; these are already written for users.
    const values = Object.values(detail);
    const firstMessage = values.find((value) => typeof value === 'string' && value.length > 0);
    return firstMessage || 'This row has validation problems.';
  }

  const text = String(detail == null ? '' : detail).trim();
  if (!text) {
    return text;
  }

  return describeRowToken(text) || describeFieldMessage(text) || text;
}

function toUserValidationMessages(details) {
  if (!Array.isArray(details)) {
    return [];
  }
  return details.map(userMessageForDetail);
}

module.exports = { toUserValidationMessages };