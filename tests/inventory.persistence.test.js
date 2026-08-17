const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/db/pool');
const { createConfirmedInventoryItem, getConfirmedInventoryItem } = require('../src/services/inventory-service');

async function resetInventoryTable() {
  await pool.query('TRUNCATE TABLE inventory_items RESTART IDENTITY');
}

async function logAllInventoryItems(label) {
  const rows = await pool.query(`SELECT id, name, quantity, unit, location, expiration_date::text AS expiration_date, date_type, lifecycle_status FROM inventory_items ORDER BY id`);
  console.log(`[inventory.persistence.test] ${label}: ${JSON.stringify(rows.rows)}`);
}

test('creates and retrieves a confirmed inventory item', async () => {
  await resetInventoryTable();

  const created = await createConfirmedInventoryItem({
    name: 'Milk',
    quantity: 2,
    unit: 'package',
    location: 'fridge',
    expirationDate: '2026-08-20',
    dateType: 'best_before'
  });

  const fetched = await getConfirmedInventoryItem(created.id);

  assert.equal(fetched.name, 'Milk');
  assert.equal(fetched.location, 'fridge');
  assert.equal(fetched.date_type, 'best_before');
});

test('allows optional quantity, unit, and expiration date', async () => {
  await resetInventoryTable();

  const created = await createConfirmedInventoryItem({
    name: 'Rice',
    quantity: null,
    unit: null,
    location: 'pantry',
    expirationDate: null,
    dateType: null
  });

  assert.equal(created.name, 'Rice');
  assert.equal(created.quantity, null);
  assert.equal(created.date_type, null);
});

test('defaults dateType to unspecified when date exists and no type is provided', async () => {
  await resetInventoryTable();

  const created = await createConfirmedInventoryItem({
    name: 'Yoghurt',
    quantity: 6,
    unit: 'piece',
    location: 'fridge',
    expirationDate: '2026-08-22',
    dateType: null
  });

  assert.equal(created.date_type, 'unspecified');
});

test('rejects invalid values', async () => {
  await resetInventoryTable();
  await logAllInventoryItems('test6-before-invalid-values');

  await assert.rejects(
    () => createConfirmedInventoryItem({
      name: ' ',
      quantity: -1,
      unit: 'stone',
      location: 'garage',
      expirationDate: null,
      dateType: 'best_before'
    }),
    (error) => {
      assert.equal(error.code, 'VALIDATION_FAILED');
      return true;
    }
  );
});

test('rejects impossible calendar dates in application validation', async () => {
  await resetInventoryTable();
  await logAllInventoryItems('test7-before-impossible-calendar-date');

  await assert.rejects(
    () => createConfirmedInventoryItem({
      name: 'Yoghurt',
      quantity: 1,
      unit: 'piece',
      location: 'fridge',
      expirationDate: '2026-02-30',
      dateType: 'best_before'
    }),
    (error) => {
      assert.equal(error.code, 'VALIDATION_FAILED');
      return true;
    }
  );
});

test('rejects unit without quantity', async () => {
  await resetInventoryTable();
  await logAllInventoryItems('test8-before-unit-without-quantity');

  await assert.rejects(
    () => createConfirmedInventoryItem({
      name: 'Flour',
      quantity: null,
      unit: 'kg',
      location: 'pantry',
      expirationDate: null,
      dateType: null
    }),
    (error) => {
      assert.equal(error.code, 'VALIDATION_FAILED');
      return true;
    }
  );
});

test('rejects names longer than 120 trimmed characters', async () => {
  await resetInventoryTable();
  await logAllInventoryItems('test9-before-overlength-name');

  await assert.rejects(
    () => createConfirmedInventoryItem({
      name: 'a'.repeat(121),
      quantity: 1,
      unit: 'piece',
      location: 'pantry',
      expirationDate: null,
      dateType: null
    }),
    (error) => {
      assert.equal(error.code, 'VALIDATION_FAILED');
      return true;
    }
  );
});