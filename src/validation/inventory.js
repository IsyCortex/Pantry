const VALID_LOCATIONS = new Set(['pantry', 'fridge', 'freezer']);
const VALID_UNITS = new Set(['g', 'kg', 'ml', 'l', 'piece', 'package']);
const VALID_DATE_TYPES = new Set(['best_before', 'use_by', 'unspecified']);

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

function validateInventoryItem(input) {
  const errors = [];

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) {
    errors.push('name is required');
  } else if (name.length > 120) {
    errors.push('name must be 1 to 120 trimmed characters');
  }

  if (!VALID_LOCATIONS.has(input.location)) {
    errors.push('location is invalid');
  }

  if (input.quantity != null && (!(typeof input.quantity === 'number') || input.quantity <= 0)) {
    errors.push('quantity must be a positive number when provided');
  }

  if (input.unit != null && !VALID_UNITS.has(input.unit)) {
    errors.push('unit is invalid');
  }

  if (input.unit != null && input.quantity == null) {
    errors.push('unit requires quantity');
  }

  if (input.expirationDate != null && !isIsoDate(input.expirationDate)) {
    errors.push('expirationDate must be a valid ISO date when provided');
  }

  if (input.expirationDate == null) {
    if (input.dateType != null) {
      errors.push('dateType must be null when expirationDate is missing');
    }
  } else if (input.dateType != null && !VALID_DATE_TYPES.has(input.dateType)) {
    errors.push('dateType is invalid');
  }

  return {
    valid: errors.length === 0,
    errors,
    value: {
      name,
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      location: input.location,
      expirationDate: input.expirationDate ?? null,
      dateType: input.expirationDate == null ? null : (input.dateType ?? 'unspecified')
    }
  };
}

module.exports = { validateInventoryItem };