'use strict';

// Structural validation for the Pantry analyzer contract
// (docs/analyzer-contract.md).
//
// This module is the single reusable implementation of the contract's input
// schema and proposal-validation rules. The provider factory
// (src/analyzers/provider.js) validates analyzer input before dispatch and
// analyzer output before returning it, so every provider path — the
// deterministic fake provider (Ticket 2.1), any live provider (Ticket 2.4),
// and Ticket 2.3 enforcement — exercises exactly the same rules.
//
// Responsibility boundaries (per the contract's responsibility table):
//   - This module enforces structure only. It does not map failures to
//     user-facing error categories and does not own failure handling; that is
//     Ticket 2.3's scope (amended by the product owner on 2026-08-24 to
//     consume this module instead of re-implementing it).

const LOCATIONS = ['pantry', 'fridge', 'freezer'];
const DATE_TYPES = ['best_before', 'use_by', 'unspecified'];
const UNITS = ['g', 'kg', 'ml', 'l', 'piece', 'package'];

const PROPOSAL_ITEM_KEYS = [
  'dateType',
  'expirationDate',
  'location',
  'name',
  'quantity',
  'unit'
];

const MAX_RAW_TEXT_LENGTH = 4000;
const MAX_ITEMS = 50;
const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_NAME_LENGTH = 120;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// `null` is a meaningful "absent" value throughout the contract; `undefined`
// additionally means "property omitted", which is reported separately.
function isPresent(value) {
  return value !== null && value !== undefined;
}

function isValidIsoCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

function validateAnalyzerInput(input) {
  const errors = [];
  if (!isPlainObject(input)) {
    errors.push('input must be an object');
    return { ok: false, errors };
  }
  for (const field of ['rawText', 'referenceDate', 'timezone', 'locale']) {
    if (typeof input[field] !== 'string') {
      errors.push(`${field} must be a string`);
    }
  }
  if (
    typeof input.rawText === 'string' &&
    input.rawText.length > MAX_RAW_TEXT_LENGTH
  ) {
    errors.push(`rawText must not exceed ${MAX_RAW_TEXT_LENGTH} characters`);
  }
  if (
    typeof input.referenceDate === 'string' &&
    !isValidIsoCalendarDate(input.referenceDate)
  ) {
    errors.push('referenceDate must be a valid ISO calendar date (YYYY-MM-DD)');
  }
  if (typeof input.timezone === 'string' && input.timezone.trim() === '') {
    errors.push('timezone must be a non-empty IANA timezone');
  }
  if (typeof input.locale === 'string' && input.locale.trim() === '') {
    errors.push('locale must be a non-empty locale tag');
  }
  return { ok: errors.length === 0, errors };
}

function validateProposalItem(item, index, errors) {
  const at = `items[${index}]`;
  if (!isPlainObject(item)) {
    errors.push(`${at} must be an object`);
    return;
  }
  for (const key of Object.keys(item)) {
    if (!PROPOSAL_ITEM_KEYS.includes(key)) errors.push(`${at} has unknown property: ${key}`);
  }
  if (!('name' in item)) errors.push(`${at} is missing property: name`);
  if (typeof item.name !== 'string' || item.name.trim().length < 1 || item.name.trim().length > MAX_NAME_LENGTH) {
    errors.push(`${at}.name must be a non-empty string of at most ${MAX_NAME_LENGTH} characters`);
  }
  if (isPresent(item.quantity) && (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
    errors.push(`${at}.quantity must be a positive finite number when present`);
  }
  if (isPresent(item.unit) && (typeof item.unit !== 'string' || !UNITS.includes(item.unit))) {
    errors.push(`${at}.unit must be one of: ${UNITS.join(', ')} when present`);
  }
  if (isPresent(item.unit) && !isPresent(item.quantity)) errors.push(`${at}.unit requires quantity to be present`);
  if (isPresent(item.location) && (typeof item.location !== 'string' || !LOCATIONS.includes(item.location))) {
    errors.push(`${at}.location must be one of: ${LOCATIONS.join(', ')} when present`);
  }
  if (isPresent(item.expirationDate) && !isValidIsoCalendarDate(item.expirationDate)) {
    errors.push(`${at}.expirationDate must be a valid ISO calendar date when present`);
  }
  if (isPresent(item.dateType) && (typeof item.dateType !== 'string' || !DATE_TYPES.includes(item.dateType))) {
    errors.push(`${at}.dateType must be one of: ${DATE_TYPES.join(', ')} when present`);
  }
}

function validateAnalyzerProposal(output) {
  const errors = [];
  if (!isPlainObject(output)) return { ok: false, errors: ['proposal must be an object'] };
  if (Object.keys(output).length !== 1 || !Object.prototype.hasOwnProperty.call(output, 'items')) {
    errors.push('proposal must contain exactly one property: items');
  }
  if (!Array.isArray(output.items)) return { ok: false, errors: [...errors, 'items must be an array'] };
  if (output.items.length > MAX_ITEMS) errors.push(`proposal exceeds the maximum of ${MAX_ITEMS} items`);
  if (Buffer.byteLength(JSON.stringify(output), 'utf8') > MAX_PAYLOAD_BYTES) errors.push('proposal payload exceeds 64 KB');
  output.items.forEach((item, index) => validateProposalItem(item, index, errors));
  return { ok: errors.length === 0, errors };
}

function assertAnalyzerInput(input) {
  const result = validateAnalyzerInput(input);
  if (!result.ok) throw new Error(`ANALYZER_INVALID_INPUT: ${result.errors.join('; ')}`);
}

function assertAnalyzerProposal(output) {
  const result = validateAnalyzerProposal(output);
  if (!result.ok) throw new Error(`ANALYZER_INVALID_OUTPUT: ${result.errors.join('; ')}`);
}

module.exports = {
  LOCATIONS,
  DATE_TYPES,
  UNITS,
  MAX_RAW_TEXT_LENGTH,
  MAX_ITEMS,
  MAX_PAYLOAD_BYTES,
  MAX_NAME_LENGTH,
  isValidIsoCalendarDate,
  validateAnalyzerInput,
  validateAnalyzerProposal,
  assertAnalyzerInput,
  assertAnalyzerProposal
};
