const test = require('node:test');
const assert = require('node:assert/strict');

const {
  STATUS,
  deriveExpirationStatus,
  applyExpirationStatus,
  formatExpirationStatusLabel
} = require('../src/services/expiration-status-service');
const { todayInZone, daysBetween } = require('../src/services/app-date');

// Deterministic reference date. The evaluated environment date is 2026-08-26.
const TODAY = '2026-08-26';
// Confirmed Ticket 3.1 threshold: a fixed 3-calendar-day expiring_soon window.
const WINDOW = 3;

test('undated items are no_date regardless of dateType', () => {
  assert.equal(deriveExpirationStatus({}, TODAY, WINDOW), STATUS.NO_DATE);
  assert.equal(deriveExpirationStatus({ expirationDate: null }, TODAY, WINDOW), STATUS.NO_DATE);
  assert.equal(deriveExpirationStatus({ expirationDate: null, dateType: 'use_by' }, TODAY, WINDOW), STATUS.NO_DATE);
  assert.equal(deriveExpirationStatus({ expirationDate: null, dateType: 'best_before' }, TODAY, WINDOW), STATUS.NO_DATE);
});

test('items expiring before today are expired', () => {
  assert.equal(deriveExpirationStatus({ expirationDate: '2026-08-25' }, TODAY, WINDOW), STATUS.EXPIRED);
  assert.equal(deriveExpirationStatus({ expirationDate: '2026-06-01' }, TODAY, WINDOW), STATUS.EXPIRED);
});

test('items expiring today or within the 3-day window are expiring_soon (boundary 0..3)', () => {
  assert.equal(deriveExpirationStatus({ expirationDate: '2026-08-26' }, TODAY, WINDOW), STATUS.EXPIRING_SOON); // 0
  assert.equal(deriveExpirationStatus({ expirationDate: '2026-08-27' }, TODAY, WINDOW), STATUS.EXPIRING_SOON); // 1
  assert.equal(deriveExpirationStatus({ expirationDate: '2026-08-28' }, TODAY, WINDOW), STATUS.EXPIRING_SOON); // 2
  assert.equal(deriveExpirationStatus({ expirationDate: '2026-08-29' }, TODAY, WINDOW), STATUS.EXPIRING_SOON); // 3
});

test('items expiring after the window are later', () => {
  assert.equal(deriveExpirationStatus({ expirationDate: '2026-08-30' }, TODAY, WINDOW), STATUS.LATER); // 4
  assert.equal(deriveExpirationStatus({ expirationDate: '2026-09-05' }, TODAY, WINDOW), STATUS.LATER); // 10
  assert.equal(deriveExpirationStatus({ expirationDate: '2026-12-01' }, TODAY, WINDOW), STATUS.LATER);
});

test('the soon window is tunable via the window argument', () => {
  // Confirmed 3-day window: +4 is later.
  assert.equal(deriveExpirationStatus({ expirationDate: '2026-08-30' }, TODAY, 3), STATUS.LATER);
  // A 5-day window promotes +4 to expiring_soon.
  assert.equal(deriveExpirationStatus({ expirationDate: '2026-08-30' }, TODAY, 5), STATUS.EXPIRING_SOON);
  // A 0-day window makes today the last expiring_soon point.
  assert.equal(deriveExpirationStatus({ expirationDate: '2026-08-26' }, TODAY, 0), STATUS.EXPIRING_SOON);
  assert.equal(deriveExpirationStatus({ expirationDate: '2026-08-27' }, TODAY, 0), STATUS.LATER);
});

test('status ignores date_type; only the expiration date drives classification', () => {
  const soon = deriveExpirationStatus({ expirationDate: '2026-08-29', dateType: 'best_before' }, TODAY, WINDOW);
  assert.equal(soon, STATUS.EXPIRING_SOON);
  assert.equal(deriveExpirationStatus({ expirationDate: '2026-08-29', dateType: 'use_by' }, TODAY, WINDOW), soon);
  assert.equal(deriveExpirationStatus({ expirationDate: '2026-08-29', dateType: 'unspecified' }, TODAY, WINDOW), soon);
});

test('daysBetween counts calendar days between ISO dates', () => {
  assert.equal(daysBetween('2026-08-26', '2026-08-26'), 0);
  assert.equal(daysBetween('2026-08-26', '2026-08-25'), -1);
  assert.equal(daysBetween('2026-08-26', '2026-08-29'), 3);
  assert.equal(daysBetween('2026-08-26', '2026-09-05'), 10);
});

test('applyExpirationStatus attaches status using an injected reference date and window', () => {
  const items = [
    { id: 1, name: 'Milk', expirationDate: '2026-08-20' },
    { id: 2, name: 'Eggs', expirationDate: '2026-08-29' },
    { id: 3, name: 'Flour', expirationDate: '2026-09-10' },
    { id: 4, name: 'Rice', expirationDate: null }
  ];
  const out = applyExpirationStatus(items, { referenceDate: TODAY, soonWindowDays: WINDOW });
  const byId = Object.fromEntries(out.map((i) => [i.id, i]));

  assert.equal(byId[1].expirationStatus, STATUS.EXPIRED);
  assert.equal(byId[1].expirationStatusClass, 'expired');
  assert.equal(byId[2].expirationStatus, STATUS.EXPIRING_SOON);
  assert.equal(byId[2].expirationStatusLabel, 'Expiring soon');
  assert.equal(byId[3].expirationStatus, STATUS.LATER);
  assert.equal(byId[4].expirationStatus, STATUS.NO_DATE);
  assert.equal(byId[4].expirationStatusLabel, null);
  // Additive: original display fields are preserved.
  assert.equal(byId[1].name, 'Milk');
  assert.equal(byId[1].id, 1);
});

test('todayInZone resolves the Europe/Berlin calendar date, not UTC, near local midnight (L5 regression class)', () => {
  // 2026-08-25T23:00:00Z = 2026-08-26T01:00 in Berlin (CEST, UTC+2).
  const at = new Date('2026-08-25T23:00:00Z');
  assert.equal(todayInZone('Europe/Berlin', at), '2026-08-26');
  // The same instant is still 2026-08-25 in UTC — proving the zone is decisive.
  assert.equal(todayInZone('UTC', at), '2026-08-25');
  // Near the other side of midnight: 2026-08-26T22:30:00Z = 2026-08-27T00:30 Berlin.
  assert.equal(todayInZone('Europe/Berlin', new Date('2026-08-26T22:30:00Z')), '2026-08-27');
});

test('config defaults the dedicated expiration timezone to Europe/Berlin and the window to 3 (hermetic)', () => {
  // Neutralize env to assert documented defaults (mirrors the pattern in
  // tests/analyzer-local-provider.test.js). Empty string triggers each
  // `process.env.X || default` fallback; dotenv does not override a set var.
  const configPath = require.resolve('../src/config');
  const savedTz = process.env.EXPIRATION_TIMEZONE;
  const savedDays = process.env.EXPIRATION_SOON_DAYS;
  process.env.EXPIRATION_TIMEZONE = '';
  process.env.EXPIRATION_SOON_DAYS = '';
  delete require.cache[configPath];
  try {
    const fresh = require('../src/config');
    assert.equal(fresh.expirationTimezone, 'Europe/Berlin');
    assert.equal(fresh.expirationSoonDays, 3);
    // Q2 decision: the expiration zone is deliberately separate from the
    // analyzer zone.
    assert.notEqual(fresh.expirationTimezone, fresh.analyzerTimezone);
  } finally {
    if (savedTz === undefined) delete process.env.EXPIRATION_TIMEZONE;
    else process.env.EXPIRATION_TIMEZONE = savedTz;
    if (savedDays === undefined) delete process.env.EXPIRATION_SOON_DAYS;
    else process.env.EXPIRATION_SOON_DAYS = savedDays;
    delete require.cache[configPath];
  }
});

test('status labels are neutral user-facing text', () => {
  assert.equal(formatExpirationStatusLabel(STATUS.EXPIRED), 'Expired');
  assert.equal(formatExpirationStatusLabel(STATUS.EXPIRING_SOON), 'Expiring soon');
  assert.equal(formatExpirationStatusLabel(STATUS.LATER), 'Later');
  assert.equal(formatExpirationStatusLabel(STATUS.NO_DATE), null);
});