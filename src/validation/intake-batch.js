const VALID_LOCATIONS = new Set(['pantry', 'fridge', 'freezer']);
const VALID_UNITS = new Set(['g', 'kg', 'ml', 'l', 'piece', 'package']);
const VALID_DATE_TYPES = new Set(['best_before', 'use_by', 'unspecified']);

function hasValue(value) {
  return value != null && value !== '';
}

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

function normalizeDraftItem(input, index) {
  const errors = [];
  const rawName = typeof input.name === 'string' ? input.name.trim() : '';
  const name = rawName || null;

  if (rawName.length > 120) {
    errors.push(`rows[${index}].name must be 1 to 120 trimmed characters when provided`);
  }

  const location = input.location == null || input.location === '' ? null : input.location;
  if (location != null && !VALID_LOCATIONS.has(location)) {
    errors.push(`rows[${index}].location is invalid`);
  }

  const quantity = input.quantity == null || input.quantity === '' ? null : Number(input.quantity);
  if (quantity != null && (!Number.isFinite(quantity) || quantity <= 0)) {
    errors.push(`rows[${index}].quantity must be a positive number when provided`);
  }

  const unit = input.unit == null || input.unit === '' ? null : input.unit;
  if (unit != null && !VALID_UNITS.has(unit)) {
    errors.push(`rows[${index}].unit is invalid`);
  }

  if (unit != null && quantity == null) {
    errors.push(`rows[${index}].unit requires quantity`);
  }

  const expirationDate = input.expirationDate == null || input.expirationDate === '' ? null : input.expirationDate;
  if (expirationDate != null && !isIsoDate(expirationDate)) {
    errors.push(`rows[${index}].expirationDate must be a valid ISO date when provided`);
  }

  let dateType = input.dateType == null || input.dateType === '' ? null : input.dateType;
  if (expirationDate == null) {
    if (dateType != null) {
      errors.push(`rows[${index}].dateType must be null when expirationDate is missing`);
    }
    dateType = null;
  } else if (dateType != null && !VALID_DATE_TYPES.has(dateType)) {
    errors.push(`rows[${index}].dateType is invalid`);
  } else if (dateType == null) {
    dateType = 'unspecified';
  }

  return {
    errors,
    value: {
      name,
      quantity,
      unit,
      location,
      expirationDate,
      dateType,
      accepted: input.accepted !== false
    }
  };
}

function normalizeDraftRows(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const errors = [];
  const normalizedRows = safeRows.map((row, index) => {
    const normalized = normalizeDraftItem(row, index);
    errors.push(...normalized.errors);
    return {
      ...normalized.value,
      position: index
    };
  });

  return {
    valid: errors.length === 0,
    errors,
    value: normalizedRows
  };
}

module.exports = {
  normalizeDraftRows,
  hasValue,
  VALID_LOCATIONS,
  VALID_UNITS,
  VALID_DATE_TYPES
};