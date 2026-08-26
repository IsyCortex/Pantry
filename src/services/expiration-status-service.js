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
      expirationStatusClass: formatExpirationStatusClass(status)
    };
  });
}

module.exports = {
  STATUS,
  deriveExpirationStatus,
  formatExpirationStatusLabel,
  formatExpirationStatusClass,
  applyExpirationStatus
};
