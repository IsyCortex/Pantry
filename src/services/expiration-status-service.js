// Ticket 3.1 — expiration status derivation (calculated, never persisted).
//
// Status per active inventory item: `expired` | `expiring_soon` | `later` |
// `no_date`, computed from the item's `expiration_date` (a SQL DATE) against
// the application "today" in `config.expirationTimezone` (default Europe/Berlin).
//
//   - no_date:        item has no expiration_date.
//   - expired:        expiration_date is before the application "today".
//   - expiring_soon:  expires today or within `expirationSoonDays` days
//                      (today <= daysUntil <= soonWindowDays).
//   - later:          expires after the soon window.
//
// `date_type` (best_before / use_by / unspecified) is intentionally OUT OF
// SCOPE for the classification — it only labels the date for the user. The
// interface must never claim that a date alone determines food safety
// (acceptance criterion); "Use by" vs "Best before" labels carry the
// safety-vs-quality context.
const config = require('../config');
const { todayInZone, daysBetween } = require('./app-date');

const STATUS = Object.freeze({
  EXPIRED: 'expired',
  EXPIRING_SOON: 'expiring_soon',
  LATER: 'later',
  NO_DATE: 'no_date'
});

const STATUS_LABELS = {
  [STATUS.EXPIRED]: 'Expired',
  [STATUS.EXPIRING_SOON]: 'Expiring soon',
  [STATUS.LATER]: 'Later',
  [STATUS.NO_DATE]: null
};

const STATUS_CLASSES = {
  [STATUS.EXPIRED]: 'expired',
  [STATUS.EXPIRING_SOON]: 'expiring-soon',
  [STATUS.LATER]: 'later',
  [STATUS.NO_DATE]: null
};

// Visible glyphs rendered beside each badge label (aria-hidden in the view).
// The text label stays the accessible cue; the glyph adds a second non-color
// signal so state never depends on color alone (Ticket 3.2). Latin-1 glyphs
// are used deliberately so they render across common system fonts.
const STATUS_GLYPHS = {
  [STATUS.EXPIRED]: '×',
  [STATUS.EXPIRING_SOON]: '!',
  [STATUS.LATER]: '·',
  [STATUS.NO_DATE]: null
};

// Pure: derive status from a date-only expirationDate and a date-only
// referenceDate (both YYYY-MM-DD) and an explicit soonWindowDays.
function deriveExpirationStatus(item, referenceDate, soonWindowDays = config.expirationSoonDays) {
  const expirationDate = item && item.expirationDate;
  if (expirationDate == null) {
    return STATUS.NO_DATE;
  }

  const daysUntil = daysBetween(referenceDate, expirationDate);
  if (daysUntil < 0) {
    return STATUS.EXPIRED;
  }
  if (daysUntil <= soonWindowDays) {
    return STATUS.EXPIRING_SOON;
  }
  return STATUS.LATER;
}

function formatExpirationStatusLabel(status) {
  return STATUS_LABELS[status] || null;
}

function formatExpirationStatusClass(status) {
  return STATUS_CLASSES[status] || null;
}

function formatExpirationStatusGlyph(status) {
  return STATUS_GLYPHS[status] || null;
}

// Display priority (Ticket 3.2): most urgent first, undated last-but-visible.
const STATUS_DISPLAY_ORDER = {
  [STATUS.EXPIRED]: 0,
  [STATUS.EXPIRING_SOON]: 1,
  [STATUS.LATER]: 2,
  [STATUS.NO_DATE]: 3
};

function expirationStatusRank(status) {
  return Object.prototype.hasOwnProperty.call(STATUS_DISPLAY_ORDER, status)
    ? STATUS_DISPLAY_ORDER[status]
    : STATUS_DISPLAY_ORDER[STATUS.NO_DATE];
}

// Deterministic comparator over display items:
//   1. status rank (expired -> expiring_soon -> later -> no_date)
//   2. expiration date ascending within each dated group
//   3. id ascending, then name ascending (stable final fallback)
function compareInventoryItemsForDisplay(a, b) {
  const rankDiff = expirationStatusRank(a && a.expirationStatus) -
    expirationStatusRank(b && b.expirationStatus);
  if (rankDiff !== 0) {
    return rankDiff;
  }

  const aDate = (a && a.expirationDate) || '';
  const bDate = (b && b.expirationDate) || '';
  if (aDate !== bDate) {
    if (!aDate) return 1;
    if (!bDate) return -1;
    return aDate < bDate ? -1 : 1;
  }

  const aId = Number.isFinite(a && a.id) ? a.id : Number.POSITIVE_INFINITY;
  const bId = Number.isFinite(b && b.id) ? b.id : Number.POSITIVE_INFINITY;
  if (aId !== bId) {
    return aId - bId;
  }

  const aName = (a && a.name) || '';
  const bName = (b && b.name) || '';
  if (aName !== bName) {
    return aName < bName ? -1 : 1;
  }
  return 0;
}

function orderInventoryItemsForDisplay(items) {
  return items.slice().sort(compareInventoryItemsForDisplay);
}

// Ticket 3.4 — tally display items by derived expiration status. Operates on
// items that already carry `expirationStatus` (post `applyExpirationStatus`),
// so it needs no persistence query and always agrees with the per-item badges.
// Returned object uses the STATUS keys and always includes every key so callers
// (and the overview template) never deal with missing counts.
function computeExpirationCounts(displayItems) {
  const counts = {
    [STATUS.EXPIRED]: 0,
    [STATUS.EXPIRING_SOON]: 0,
    [STATUS.LATER]: 0,
    [STATUS.NO_DATE]: 0
  };
  for (const item of displayItems || []) {
    const status = item && item.expirationStatus;
    if (Object.prototype.hasOwnProperty.call(counts, status)) {
      counts[status] += 1;
    }
  }
  return counts;
}

// Attach expirationStatus (and neutral label/class) to each display item.
// By default "today" is the real application date in config.expirationTimezone.
// `options` let tests inject a fixed `referenceDate` (YYYY-MM-DD) or `now` (a
// Date / date-only string) for deterministic boundary behavior.
function applyExpirationStatus(displayItems, options = {}) {
  const { referenceDate, now, soonWindowDays } = options;
  const refDate = referenceDate || todayInZone(config.expirationTimezone, now && new Date(now));

  return displayItems.map((item) => {
    const status = deriveExpirationStatus(item, refDate, soonWindowDays);
    return {
      ...item,
      expirationStatus: status,
      expirationStatusLabel: formatExpirationStatusLabel(status),
      expirationStatusClass: formatExpirationStatusClass(status),
      expirationStatusGlyph: formatExpirationStatusGlyph(status)
    };
  });
}

module.exports = {
  STATUS,
  deriveExpirationStatus,
  formatExpirationStatusLabel,
  formatExpirationStatusClass,
  formatExpirationStatusGlyph,
  expirationStatusRank,
  compareInventoryItemsForDisplay,
  orderInventoryItemsForDisplay,
  applyExpirationStatus,
  computeExpirationCounts
};
