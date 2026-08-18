const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/db/pool');
const { createConfirmedInventoryItem, getConfirmedInventoryItem, updateConfirmedInventoryItem, markInventoryItemRemoved, getActiveInventoryForDisplay } = require('../src/services/inventory-service');
const { saveManualDraftBatch, markBatchPendingReview, confirmIntakeBatch } = require('../src/services/intake-batch-service');

async function resetInventoryTable() {
  await pool.query('TRUNCATE TABLE inventory_items RESTART IDENTITY');
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

test('edits an active confirmed inventory item without changing source batch linkage', async () => {
  await resetInventoryTable();

  const created = await createConfirmedInventoryItem({
    name: 'Milk',
    quantity: 2,
    unit: 'package',
    location: 'fridge',
    expirationDate: '2026-08-20',
    dateType: 'best_before',
    sourceBatchId: 7
  });

  const updated = await updateConfirmedInventoryItem(created.id, {
    name: 'Oat Milk',
    quantity: 3,
    unit: 'package',
    location: 'pantry',
    expirationDate: '2026-08-25',
    dateType: 'best_before'
  });

  assert.equal(updated.name, 'Oat Milk');
  assert.equal(updated.location, 'pantry');
  assert.equal(updated.source_batch_id, 7);
});

test('rejects invalid updates using the same inventory validation rules', async () => {
  await resetInventoryTable();

  const created = await createConfirmedInventoryItem({
    name: 'Milk',
    quantity: 2,
    unit: 'package',
    location: 'fridge',
    expirationDate: '2026-08-20',
    dateType: 'best_before'
  });

  await assert.rejects(
    () => updateConfirmedInventoryItem(created.id, {
      name: ' ',
      quantity: -1,
      unit: 'package',
      location: 'garage',
      expirationDate: null,
      dateType: null
    }),
    (error) => {
      assert.equal(error.code, 'VALIDATION_FAILED');
      return true;
    }
  );
});

test('marks an active item used up and removes it from active inventory', async () => {
  await resetInventoryTable();

  const created = await createConfirmedInventoryItem({
    name: 'Milk',
    quantity: 2,
    unit: 'package',
    location: 'fridge',
    expirationDate: null,
    dateType: null
  });

  const removed = await markInventoryItemRemoved(created.id, 'used_up');
  assert.equal(removed.lifecycle_status, 'used_up');
  assert.ok(removed.removed_at);

  const activeItems = await getActiveInventoryForDisplay();
  assert.equal(activeItems.length, 0);
});

test('marks an active item discarded and removes it from active inventory', async () => {
  await resetInventoryTable();

  const created = await createConfirmedInventoryItem({
    name: 'Soup',
    quantity: 1,
    unit: 'package',
    location: 'pantry',
    expirationDate: null,
    dateType: null
  });

  const removed = await markInventoryItemRemoved(created.id, 'discarded');
  assert.equal(removed.lifecycle_status, 'discarded');
  assert.ok(removed.removed_at);

  const activeItems = await getActiveInventoryForDisplay();
  assert.equal(activeItems.length, 0);
});

test('rejects unsupported lifecycle transitions for already removed items', async () => {
  await resetInventoryTable();

  const created = await createConfirmedInventoryItem({
    name: 'Soup',
    quantity: 1,
    unit: 'package',
    location: 'pantry',
    expirationDate: null,
    dateType: null
  });

  await markInventoryItemRemoved(created.id, 'discarded');

  await assert.rejects(
    () => markInventoryItemRemoved(created.id, 'used_up'),
    (error) => {
      assert.equal(error.code, 'INVALID_STATE_TRANSITION');
      return true;
    }
  );
});

test('editing a confirmed inventory item does not rewrite the original intake batch row', async () => {
  await resetInventoryTable();
  await pool.query('TRUNCATE TABLE intake_batch_items, intake_batches RESTART IDENTITY CASCADE');

  const batch = await saveManualDraftBatch({
    batchId: null,
    rows: [
      { name: 'Milk', quantity: '2', unit: 'package', location: 'fridge', expirationDate: '2026-08-20', dateType: 'best_before', accepted: true }
    ]
  });
  await markBatchPendingReview(batch.id);
  const confirmation = await confirmIntakeBatch(batch.id);

  const updated = await updateConfirmedInventoryItem(confirmation.createdItems[0].id, {
    name: 'Oat Milk',
    quantity: 3,
    unit: 'package',
    location: 'pantry',
    expirationDate: '2026-08-25',
    dateType: 'best_before'
  });

  assert.equal(updated.name, 'Oat Milk');

  const batchRows = await pool.query(
    `SELECT name, quantity, unit, location, expiration_date::text AS expiration_date, date_type
     FROM intake_batch_items
     WHERE batch_id = $1`,
    [batch.id]
  );

  assert.equal(batchRows.rows[0].name, 'Milk');
  assert.equal(batchRows.rows[0].quantity, '2');
  assert.equal(batchRows.rows[0].location, 'fridge');
  assert.equal(batchRows.rows[0].expiration_date, '2026-08-20');
});

test('ordinary edits preserve lifecycle state and removed_at for active items', async () => {
  await resetInventoryTable();

  const created = await createConfirmedInventoryItem({
    name: 'Milk',
    quantity: 2,
    unit: 'package',
    location: 'fridge',
    expirationDate: null,
    dateType: null
  });

  const updated = await updateConfirmedInventoryItem(created.id, {
    name: 'Oat Milk',
    quantity: 3,
    unit: 'package',
    location: 'pantry',
    expirationDate: null,
    dateType: null
  });

  assert.equal(updated.lifecycle_status, 'active');
  assert.equal(updated.removed_at, null);
});

test('ordinary edit is rejected for removed items and does not reactivate them', async () => {
  await resetInventoryTable();

  const created = await createConfirmedInventoryItem({
    name: 'Soup',
    quantity: 1,
    unit: 'package',
    location: 'pantry',
    expirationDate: null,
    dateType: null
  });

  await markInventoryItemRemoved(created.id, 'discarded');

  await assert.rejects(
    () => updateConfirmedInventoryItem(created.id, {
      name: 'Tomato Soup',
      quantity: 2,
      unit: 'package',
      location: 'pantry',
      expirationDate: null,
      dateType: null
    }),
    (error) => {
      assert.equal(error.code, 'INVALID_STATE_TRANSITION');
      return true;
    }
  );

  const fetched = await getConfirmedInventoryItem(created.id);
  assert.equal(fetched.lifecycle_status, 'discarded');
  assert.ok(fetched.removed_at);
});