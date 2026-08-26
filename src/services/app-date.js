// Centralized, zone-aware wall-clock + calendar-date calculation.
//
// Ticket 3.1 task "Centralize application-date handling." There is exactly one
// way to derive "today" / calendar dates in-zone, so the analyzer reference
// date (input pipeline, Ticket 2) and the inventory expiration-status
// calculation (Ticket 3.1) can never disagree about what "today" means.
//
// NOTE: `expirationDate` on inventory rows is a SQL DATE (date-only). Expiration
// status is derived from these date-only values and is NEVER persisted
// (docs/domain-model.md, "Expiration status: calculated, must not be
// persisted").
const config = require('../config');

const ISO_CALENDAR_OPTIONS = { year: 'numeric', month: '2-digit', day: '2-digit' };

// Calendar date of `date`, interpreted in `timezone`, as YYYY-MM-DD.
// en-CA prints ISO YYYY-MM-DD, matching the stored date format everywhere dates
// are exchanged between storage and views.
function calendarDateInZone(date, timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    ...ISO_CALENDAR_OPTIONS,
    timeZone: timezone
  }).format(date);
}

// The application's calendar date in the given (or default expiration) zone.
// `now` is injectable for deterministic boundary tests — e.g. an instant one
// hour before local midnight in Europe/Berlin must resolve to the Berlin
// calendar date, never the UTC date (the L5-class defect).
function todayInZone(timezone = config.expirationTimezone, now = new Date()) {
  return calendarDateInZone(now, timezone);
}

// Whole-day difference between two date-only YYYY-MM-DD strings (end - start).
// Both operands are date-only calendar dates, so parsing them as UTC midnights
// yields an exact day count with no timezone ambiguity. Pure function; no wall
// clock involved.
function daysBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end - start) / msPerDay);
}

module.exports = {
  calendarDateInZone,
  todayInZone,
  daysBetween
};
