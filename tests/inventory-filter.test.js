const test = require('node:test');
const assert = require('node:assert/strict');

// Pure unit coverage for the Ticket 3.3 inventory filter. No database is
// touched: filterInventoryItems operates on already-derived display items
// (the same shape getActiveInventoryForDisplay produces).
const { filterInventoryItems } = require('../src/services/inventory-service');

const FIXTURES = [
  { id: 1, name: 'Milk', location: 'fridge', expirationStatus: 'expired', expirationDate: '2026-08-01' },
  { id: 2, name: 'Yoghurt', location: 'fridge', expirationStatus: 'expiring_soon', expirationDate: '2026-08-27' },
  { id: 3, name: 'Cheese', location: 'freezer', expirationStatus: 'later', expirationDate: '2026-12-01' },
  { id: 4, name: 'Rice', location: 'pantry', expirationStatus: 'no_date', expirationDate: null }
];

test('without filters, returns a copy of all items in input order', () => {
  const out = filterInventoryItems(FIXTURES, {});
  assert.deepEqual(out.map((i) => i.id), [1, 2, 3, 4]);
  assert.notEqual(out, FIXTURES, 'returns a defensive copy');

  const outDefault = filterInventoryItems(FIXTURES);
  assert.deepEqual(outDefault.map((i) => i.id), [1, 2, 3, 4]);
});

test('location filter keeps only matching items', () => {
  const out = filterInventoryItems(FIXTURES, { location: 'fridge' });
  assert.deepEqual(out.map((i) => i.id), [1, 2]);
});

test('status filter works for every derived status including no_date', () => {
  assert.deepEqual(filterInventoryItems(FIXTURES, { status: 'expired' }).map((i) => i.name), ['Milk']);
  assert.deepEqual(filterInventoryItems(FIXTURES, { status: 'expiring_soon' }).map((i) => i.name), ['Yoghurt']);
  assert.deepEqual(filterInventoryItems(FIXTURES, { status: 'later' }).map((i) => i.name), ['Cheese']);
  assert.deepEqual(filterInventoryItems(FIXTURES, { status: 'no_date' }).map((i) => i.name), ['Rice']);
});

test('name search is a case-insensitive substring match with trimmed input', () => {
  assert.deepEqual(filterInventoryItems(FIXTURES, { q: 'MIL' }).map((i) => i.name), ['Milk']);
  assert.deepEqual(filterInventoryItems(FIXTURES, { q: '  rice  ' }).map((i) => i.name), ['Rice']);
  assert.deepEqual(filterInventoryItems(FIXTURES, { q: 'ice' }).map((i) => i.name), ['Rice'], 'substring, not whole-word');
  assert.deepEqual(filterInventoryItems(FIXTURES, { q: 'honey' }), []);
});

test('combined filters intersect (AND semantics)', () => {
  const out = filterInventoryItems(FIXTURES, { location: 'fridge', status: 'expired', q: 'mil' });
  assert.deepEqual(out.map((i) => i.name), ['Milk']);

  // Same terms, non-matching combination -> nothing.
  const none = filterInventoryItems(FIXTURES, { location: 'pantry', status: 'expired' });
  assert.deepEqual(none, []);
});

test('blank filter values never constrain the result', () => {
  const out = filterInventoryItems(FIXTURES, { location: '', status: '', q: '   ' });
  assert.deepEqual(out.map((i) => i.id), [1, 2, 3, 4]);
});
